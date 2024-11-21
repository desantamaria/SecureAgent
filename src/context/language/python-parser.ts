import { AbstractParser, EnclosingContext } from "../../constants";
import Parser = require("tree-sitter");
import Python = require("tree-sitter-python");
import { Node } from "@babel/traverse";

// Convert TreeSitter node to Babel-compatible node
const convertToBabelNode = (node: any): Node => {
  return {
    ...node,
    type: node.type,
    loc: {
      // Remove the +1 offset to match JavaScript parser behavior
      start: {
        line: node.startPosition.row,
        column: node.startPosition.column,
      },
      end: { line: node.endPosition.row, column: node.endPosition.column },
    },
  } as Node;
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
      let largestEnclosingContext: Node | null = null;
      let largestSize = 0;

      const visit = (node: any) => {
        if (
          node.type === "function_definition" ||
          node.type === "class_definition"
        ) {
          // Remove the +1 offset here as well
          const start = node.startPosition.row;
          const end = node.endPosition.row;

          if (start <= lineStart && lineEnd <= end) {
            const size = end - start;
            if (size > largestSize) {
              largestSize = size;
              largestEnclosingContext = convertToBabelNode(node);
            }
          }
        }

        if (node.children) {
          node.children.forEach(visit);
        }
      };

      visit(ast.rootNode);

      return {
        enclosingContext: largestEnclosingContext,
      };
    } catch (error) {
      console.error("Error parsing Python file:", error);
      return { enclosingContext: null };
    }
  }

  dryRun(file: string): { valid: boolean; error: string } {
    try {
      this.parser.parse(file);
      return { valid: true, error: "" };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
