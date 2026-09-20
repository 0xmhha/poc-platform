// Emits syntax-grounded symbols and calls without pretending to resolve dynamic dispatch.
package main

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
)

type Node struct {
	ID       string `json:"id"`
	Kind     string `json:"kind"`
	Name     string `json:"name"`
	File     string `json:"file"`
	Line     int    `json:"line"`
	Language string `json:"language"`
}
type Edge struct {
	From       string `json:"from"`
	To         string `json:"to"`
	Kind       string `json:"kind"`
	Resolution string `json:"resolution"`
}

func main() {
	root, _ := filepath.Abs(os.Args[1])
	nodes := []Node{}
	edges := []Edge{}
	issues := []string{}
	filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			issues = append(issues, err.Error())
			return nil
		}
		if d.IsDir() {
			if d.Name() == "node_modules" || strings.HasPrefix(d.Name(), ".") || d.Name() == "vendor" || d.Name() == "dist" {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasPrefix(d.Name(), "Dockerfile") || !strings.HasSuffix(path, ".go") {
			return nil
		}
		rel, _ := filepath.Rel(filepath.Dir(root), path)
		rel = filepath.ToSlash(rel)
		fs := token.NewFileSet()
		f, err := parser.ParseFile(fs, path, nil, parser.AllErrors)
		if err != nil {
			issues = append(issues, rel+": "+err.Error())
			return nil
		}
		fid := "file:" + rel
		nodes = append(nodes, Node{fid, "file", filepath.Base(path), rel, 1, "go"})
		for _, i := range f.Imports {
			edges = append(edges, Edge{fid, strings.Trim(i.Path.Value, "\""), "imports", "import-path"})
		}
		for _, decl := range f.Decls {
			switch n := decl.(type) {
			case *ast.FuncDecl:
				name := n.Name.Name
				if n.Recv != nil {
					switch t := n.Recv.List[0].Type.(type) {
					case *ast.Ident:
						name = t.Name + "." + name
					case *ast.StarExpr:
						if id, ok := t.X.(*ast.Ident); ok {
							name = id.Name + "." + name
						}
					}
				}
				id := rel + "#" + name
				nodes = append(nodes, Node{id, "function", name, rel, fs.Position(n.Pos()).Line, "go"})
				edges = append(edges, Edge{fid, id, "declares", "ast"})
				ast.Inspect(n.Body, func(a ast.Node) bool {
					if c, ok := a.(*ast.CallExpr); ok {
						target := ""
						switch x := c.Fun.(type) {
						case *ast.Ident:
							target = x.Name
						case *ast.SelectorExpr:
							if recv, ok := x.X.(*ast.Ident); ok {
								target = recv.Name + "." + x.Sel.Name
							} else {
								target = x.Sel.Name
							}
						}
						if target != "" {
							edges = append(edges, Edge{id, target, "calls", "syntactic"})
						}
					}
					return true
				})
			case *ast.GenDecl:
				for _, sp := range n.Specs {
					if t, ok := sp.(*ast.TypeSpec); ok {
						id := rel + "#" + t.Name.Name
						nodes = append(nodes, Node{id, "type", t.Name.Name, rel, fs.Position(t.Pos()).Line, "go"})
						edges = append(edges, Edge{fid, id, "declares", "ast"})
					}
				}
			}
		}
		return nil
	})
	json.NewEncoder(os.Stdout).Encode(map[string]any{"nodes": nodes, "edges": edges, "issues": issues})
}
