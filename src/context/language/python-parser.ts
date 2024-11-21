import { SyntaxNode } from "tree-sitter";
import { AbstractParser, EnclosingContext } from "../../constants";

const Parser = require("tree-sitter");
const Python = require("tree-sitter-python");

const parser = new Parser();
parser.setLanguage(Python);

const processNode = (
  node: SyntaxNode,
  lineStart: number,
  lineEnd: number,
  largestSize: number,
  largestEnclosingContext: SyntaxNode | null
) => {
  const start = node.startPosition;
  const end = node.endPosition;

  if (start.row <= lineStart && lineEnd <= end.row) {
    const size = end.row - start.row;
    if (size > largestSize) {
      largestSize = size;
      largestEnclosingContext = node;
    }
  }
  return { largestSize, largestEnclosingContext };
};

export class PythonParser implements AbstractParser {
  findEnclosingContext(
    file: string,
    lineStart: number,
    lineEnd: number
  ): EnclosingContext {
    const tree = parser.parse(file);

    // Print Tree to console
    console.log("\nTree: \n", tree.rootNode.toString());
    const callExpression = tree.rootNode.child(1).firstChild;
    console.log("\nCall Expression:\n", callExpression);

    let largestEnclosingContext: SyntaxNode = null;
    let largestSize = 0;

    // Create a cursor for traversing the tree
    const cursor = tree.rootNode.walk();

    // Traverse the tree
    let reachedRoot = false;
    while (!reachedRoot) {
      const node = cursor.currentNode;

      // Check if this node is a function or class definition
      if (
        node.type === "function_definition" ||
        node.type === "class_definition"
      ) {
        const { largestSize: newSize, largestEnclosingContext: newContext } =
          processNode(
            node,
            lineStart,
            lineEnd,
            largestSize,
            largestEnclosingContext
          );
        largestSize = newSize;
        largestEnclosingContext = newContext;
      }

      // Try to go to first child
      if (cursor.gotoFirstChild()) {
        continue;
      }

      // No children, try to go to next sibling
      if (cursor.gotoNextSibling()) {
        continue;
      }

      // No siblings, go back up to parent and try its siblings
      while (!reachedRoot) {
        if (!cursor.gotoParent()) {
          reachedRoot = true;
          break;
        }
        if (cursor.gotoNextSibling()) {
          break;
        }
      }
    }

    return {
      enclosingContext: largestEnclosingContext,
    } as EnclosingContext;
  }
  dryRun(file: string): { valid: boolean; error: string } {
    try {
      const tree = parser.parse(file);
      return {
        valid: true,
        error: "",
      };
    } catch (exc) {
      return {
        valid: false,
        error: exc,
      };
    }
  }
}
