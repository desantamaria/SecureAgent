import { encode, encodeChat } from "gpt-tokenizer";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import type { PRFile } from "./constants";
import {
  rawPatchStrategy,
  smarterContextPatchStrategy,
} from "./context/review";
import { GROQ_MODEL, type GroqChatModel } from "./llms/groq";

const ModelsToTokenLimits: Record<GroqChatModel, number> = {
  "mixtral-8x7b-32768": 32768,
  "gemma-7b-it": 32768,
  "llama3-70b-8192": 8192,
  "llama3-8b-8192": 8192,
};

export const REVIEW_DIFF_PROMPT = `You are PR-Reviewer, an expert code review assistant specialized in providing high-impact, actionable feedback on pull requests.

Key Review Guidelines:
1. Focus exclusively on new code (lines with '+' prefix)
2. Analyze for:
   - Critical code issues and bugs
   - Performance bottlenecks and optimizations
   - Security vulnerabilities and best practices
   - Code readability and maintainability improvements
   - Design pattern adherence
   - Error handling robustness
   - Resource management
   - Scalability concerns

Constraints:
- Provide only actionable code suggestions
- Ignore existing code (lines with '-' or no prefix)
- Skip suggestions already implemented in the PR
- Exclude docstring, comment, or type hint recommendations
- Focus on the code shown, without speculating about unseen context

Input Format Example:
\`\`\`diff
## src/file1.py

@@ -12,5 +12,5 @@ def func1():
 existing code...
-removed code
+new code
 existing code...

@@ ... @@ def func2():
...
\`\`\`

Your suggestions should be:
- Concrete and specific
- Implementation-ready
- Language-appropriate
- Performance-focused
- Security-conscious

Each suggestion must provide clear value and rationale for the change.`;

export const XML_PR_REVIEW_PROMPT = `As an expert code reviewer, analyze pull requests to provide precise, high-impact code improvements. Your review should identify opportunities for enhancing code quality, performance, and security.

Review Focus:
1. Code Quality
   - Architectural improvements
   - Design pattern application
   - Error handling
   - Resource management
   - Code organization

2. Performance
   - Algorithmic efficiency
   - Resource utilization
   - Memory management
   - Concurrency handling
   - Caching opportunities

3. Security
   - Vulnerability prevention
   - Input validation
   - Authentication/Authorization
   - Data protection
   - Secure coding practices

Guidelines:
- Focus only on new code ('+' lines)
- Provide concrete, implementation-ready suggestions
- Ensure suggestions haven't already been implemented
- Skip documentation-only improvements
- Base suggestions solely on visible code

Example output:
\`\`\`
<review>
  <suggestion>
    <describe>[Objective of the newly incorporated code]</describe>
    <type>[Category of the given suggestion such as performance, security, etc.]</type>
    <comment>[Guidance on enhancing the new code]</comment>
    <code>
    \`\`\`[Programming Language]
    [Equivalent code amendment in the same language]
    \`\`\`
    </code>
    <filename>[name of relevant file]</filename>
  </suggestion>
  <suggestion>
  ...
  </suggestion>
  ...
</review>
\`\`\`

Note: The 'comment' and 'describe' tags should elucidate the advice and why it’s given, while the 'code' tag hosts the recommended code snippet within proper GitHub Markdown syntax. The 'type' defines the suggestion's category such as performance, security, readability, etc.

Requirements:
1. Each suggestion must:
   - Target specific code blocks
   - Include complete implementation
   - Provide clear rationale
   - Specify improvement category

2. Code blocks must:
   - Use correct language syntax
   - Be properly formatted
   - Be ready for direct implementation
   - Include necessary context

3. Comments should:
   - Explain the improvement's impact
   - Justify the changes
   - Highlight key considerations
   - Address potential trade-offs`;

export const PR_SUGGESTION_TEMPLATE = `Problem:
{COMMENT}

Reference:
{ISSUE_LINK}

Suggested Implementation:
{CODE}
`;

const assignLineNumbers = (diff: string) => {
  const lines = diff.split("\n");
  let newLine = 0;
  const lineNumbers = [];

  for (const line of lines) {
    if (line.startsWith("@@")) {
      // This is a chunk header. Parse the line numbers.
      const match = line.match(/@@ -\d+,\d+ \+(\d+),\d+ @@/);
      newLine = parseInt(match[1]);
      lineNumbers.push(line); // keep chunk headers as is
    } else if (!line.startsWith("-")) {
      // This is a line from the new file.
      lineNumbers.push(`${newLine++}: ${line}`);
    }
  }

  return lineNumbers.join("\n");
};

export const buildSuggestionPrompt = (file: PRFile) => {
  const rawPatch = String.raw`${file.patch}`;
  const patchWithLines = assignLineNumbers(rawPatch);
  return `## ${file.filename}\n\n${patchWithLines}`;
};

export const buildPatchPrompt = (file: PRFile) => {
  if (file.old_contents == null) {
    return rawPatchStrategy(file);
  } else {
    return smarterContextPatchStrategy(file);
  }
};

export const getReviewPrompt = (diff: string): ChatCompletionMessageParam[] => {
  return [
    { role: "system", content: REVIEW_DIFF_PROMPT },
    { role: "user", content: diff },
  ];
};

export const getXMLReviewPrompt = (
  diff: string
): ChatCompletionMessageParam[] => {
  return [
    { role: "system", content: XML_PR_REVIEW_PROMPT },
    { role: "user", content: diff },
  ];
};

export const constructPrompt = (
  files: PRFile[],
  patchBuilder: (file: PRFile) => string,
  convoBuilder: (diff: string) => ChatCompletionMessageParam[]
) => {
  const patches = files.map((file) => patchBuilder(file));
  const diff = patches.join("\n");
  const convo = convoBuilder(diff);
  return convo;
};

export const getTokenLength = (blob: string) => {
  return encode(blob).length;
};

export const isConversationWithinLimit = (
  convo: any[],
  model: GroqChatModel = GROQ_MODEL
) => {
  // We don't have the encoder for our Groq model, so we're using
  // the one for gpt-3.5-turbo as a rough equivalent.
  const convoTokens = encodeChat(convo, "gpt-3.5-turbo").length;
  return convoTokens < ModelsToTokenLimits[model];
};
