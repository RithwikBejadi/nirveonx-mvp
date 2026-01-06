//2.1
import { config } from "dotenv";
import readline from "readline/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
config();

//2.2
const mcpClient = new Client({
  name: "nirveonx-mcp-client",
  version: "1.0.0",
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const chatHistory = [
  {
    role: "system",
    content: "You are a healthcare-only assistant. You must ONLY answer questions related to healthcare, wellness, diseases, medical processes, fitness, symptoms, medications (general info), mental health, and nutrition. If a user asks anything outside healthcare, reply strictly with: 'I can only respond to healthcare-related questions.' But also you can run the tool provided to you."
  },
  {
    role: "system",
    content: "When the user ask, about anything about tool, you need to just give information about them, then after if the user tell to do the task then do it, other wise not, preferred if you confirm before calling the tool at the same time while confirming ask the required parameter from the user."
  },
];
let mcpTools = [];

//2.3
mcpClient
  .connect(new SSEClientTransport(new URL("http://localhost:4000/sse")))
  .then(async () => {
    console.log("\x1b[32m[mcpConnection] status : 200 OK\x1b[0m");

    //4.2
    mcpTools = (await mcpClient.listTools()).tools.map((tool) => {
      return {
        type: "function", 
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: tool.inputSchema.type,
            properties: tool.inputSchema.properties,
            required: tool.inputSchema.required,
          },
        },
      };
    });

    //3.1
    chatLoop();
  });

//3.1
async function chatLoop(tool) {
  //4.4
  if(tool && Array.isArray(tool)) {
    chatHistory.push({
      role: `assistant`,
      tool_calls: tool,
    });

    const toolArgs = JSON.parse(tool[0].function.arguments);
    const toolResult = await mcpClient.callTool({
      name: tool[0].function.name,
      arguments: toolArgs,
    });

    chatHistory.push({
      role: `tool`,
      tool_call_id: tool[0].id,
      name: tool[0].function.name,
      content: toolResult.content,
    });

    console.log(`\x1b[32m[nirveonxMcpServer] INVOKE TOOL : ${tool[0].function.name}\x1b[0m`);
    console.log(`NirveonX AI: ${toolResult.content[0].text}\n`);
  }else {
  //3.1
  // To take user prompt through CLI
  const question = await rl.question("You: ");
  console.log("");

  // Saving chat in history for LLM context.
  chatHistory.push({
    role: `user`,
    content: question,
  });

  // LLM configuration
  const LLMoptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        tools: mcpTools, //4.3
        messages: chatHistory,
      }),
  };

  // Get LLM response
  const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      LLMoptions
  );
  const data = await response.json();
  
  // Check for API errors
  if (!response.ok || !data.choices || data.choices.length === 0) {
    console.error("\x1b[31m[API Error]\x1b[0m", data.error || data);
    console.log("NirveonX AI: Sorry, I encountered an error. Please check your GROQ_API_KEY in the .env file.\n");
    return chatLoop();
  }
  
  const toolCall = data.choices[0].message.tool_calls;
  const llmResponse = data.choices[0].message.content;

  //4.4
  if (toolCall) return chatLoop(toolCall);

    // Save LLM response - for future context
    chatHistory.push({
      role: `assistant`,
      content: llmResponse,
    });

    // Show LLM response
    console.log(`NirveonX AI: ${llmResponse}\n`);

};
  
  // Recursively calling chatLoop
  chatLoop();
}