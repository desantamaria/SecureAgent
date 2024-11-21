import { AbstractParser, EnclosingContext } from "../../constants";
import Parser = require("tree-sitter");
import * as Python from "tree-sitter-python";

interface NodePath {
  type: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: NodePath[];
}

const processNode = (
  node: NodePath,
  lineStart: number,
  lineEnd: number,
  largestSize: number,
  largestEnclosingContext: NodePath | null
) => {
  const start = node.startPosition.row + 1; // ast-sitter is 0-based
  const end = node.endPosition.row + 1;

  if (start <= lineStart && lineEnd <= end) {
    const size = end - start;
    if (size > largestSize) {
      largestSize = size;
      largestEnclosingContext = node;
    }
  }
  return { largestSize, largestEnclosingContext };
};

export class PythonParser implements AbstractParser {
  private parser: Parser;

  constructor() {
    try {
      this.parser = new Parser();
      this.parser.setLanguage(Python);
    } catch (error) {
      console.error("Failed to initialize Python parser:", error);
      throw error;
    }
  }

  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): EnclosingContext {
    try {
      const ast = this.parser.parse(file);
      let largestEnclosingContext: NodePath = null;
      let largestSize = 0;

      // Function to recursively visit nodes
      const visit = (node: NodePath) => {
        // Look for function and class definitions
        if (
          node.type === "function_definition" ||
          node.type === "class_definition"
        ) {
          ({ largestSize, largestEnclosingContext } = processNode(
            node,
            lineStart,
            lineEnd,
            largestSize,
            largestEnclosingContext
          ));
        }

        // Visit children
        if (node.children) {
          node.children.forEach(visit);
        }
      };

      visit(ast.rootNode as unknown as NodePath);

      // Convert astSitter node to a format compatible with our interface
      const context = largestEnclosingContext
        ? {
            loc: {
              start: {
                line: largestEnclosingContext.startPosition.row + 1,
                column: largestEnclosingContext.startPosition.column,
              },
              end: {
                line: largestEnclosingContext.endPosition.row + 1,
                column: largestEnclosingContext.endPosition.column,
              },
            },
            type: largestEnclosingContext.type,
          }
        : null;

      return {
        enclosingContext: context,
      } as EnclosingContext;
    } catch (error) {
      console.error("Error parsing Python file:", error);
      return { enclosingContext: null };
    }
  }

  dryRun(file: string): { valid: boolean; error: string } {
    try {
      const ast = this.parser.parse(file);
      // Check if there are any ERROR nodes in the ast
      let hasError = false;
      const cursor = ast.rootNode.walk();

      // Walk through all nodes in the ast
      do {
        if (cursor.nodeType === "ERROR") {
          hasError = true;
          break;
        }
      } while (
        cursor.gotoNextSibling() ||
        (cursor.gotoParent() && cursor.gotoNextSibling())
      );

      return {
        valid: !hasError,
        error: hasError ? "Syntax error detected in Python code" : "",
      };
    } catch (exc) {
      return {
        valid: false,
        error: exc.toString(),
      };
    }
  }
}
