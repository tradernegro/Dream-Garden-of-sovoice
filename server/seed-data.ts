// Seed data for development and testing
import { storage } from "./storage";
import type { InsertCall } from "@shared/schema";

export async function seedData() {
  console.log("Seeding sample data...");

  // Get existing data to avoid duplicates
  const existingCalls = await storage.getCalls();
  
  if (existingCalls.length > 0) {
    console.log("Data already exists, skipping seed");
    return;
  }

  // Get the default agent
  const agents = await storage.getAgents();
  const defaultAgent = agents[0];

  if (!defaultAgent) {
    console.log("No default agent found, skipping call seed");
    return;
  }

  // Create sample calls
  const sampleCalls: InsertCall[] = [
    {
      phoneNumber: "+1-555-0101",
      direction: "inbound",
      status: "completed",
      duration: 245,
      transcript: "Customer: Hi, I'd like to know more about your services.\nAgent: Of course! I'd be happy to help you learn about our AI voice assistant platform. We offer automated call handling with natural language processing.\nCustomer: That sounds interesting. How does it work?\nAgent: Our AI can handle customer inquiries, take messages, and even schedule appointments. It works 24/7 and can handle multiple calls simultaneously.\nCustomer: Great! I'd like to sign up for a demo.\nAgent: Wonderful! I'll connect you with our sales team to schedule that.",
      agentId: defaultAgent.id,
      tags: ["lead", "demo-request"],
    },
    {
      phoneNumber: "+1-555-0102",
      direction: "outbound",
      status: "completed",
      duration: 180,
      transcript: "Agent: Hello, this is SoVoice AI calling about your recent inquiry.\nCustomer: Oh yes, I was interested in learning more.\nAgent: Perfect! I wanted to follow up and see if you had any questions about our platform.\nCustomer: Yes, what's the pricing like?\nAgent: We have flexible plans starting at $99 per month. Would you like me to send you detailed pricing information?\nCustomer: Yes please, that would be great.",
      agentId: defaultAgent.id,
      tags: ["follow-up", "pricing-inquiry"],
    },
    {
      phoneNumber: "+1-555-0103",
      direction: "inbound",
      status: "completed",
      duration: 95,
      transcript: "Customer: I'm having trouble with my account.\nAgent: I'm sorry to hear that. Can you describe the issue?\nCustomer: I can't log in to the dashboard.\nAgent: Let me help you with that. I'll send you a password reset link right away.\nCustomer: Thank you!",
      agentId: defaultAgent.id,
      tags: ["support", "account-issue"],
    },
    {
      phoneNumber: "+1-555-0104",
      direction: "inbound",
      status: "no-answer",
      duration: undefined,
      agentId: defaultAgent.id,
    },
    {
      phoneNumber: "+1-555-0105",
      direction: "outbound",
      status: "completed",
      duration: 320,
      transcript: "Agent: Good afternoon! This is SoVoice AI. I wanted to check in about your recent experience with our service.\nCustomer: It's been great! The AI is really responsive and natural.\nAgent: That's wonderful to hear! Have you explored all the features?\nCustomer: Not yet, but I'm planning to set up more agents this week.\nAgent: Excellent! If you need any assistance, feel free to reach out. We're here to help.\nCustomer: Will do, thanks!",
      agentId: defaultAgent.id,
      tags: ["check-in", "positive-feedback"],
    },
  ];

  // Add calls with timestamps spread over the past week
  const now = Date.now();
  for (let i = 0; i < sampleCalls.length; i++) {
    const call = sampleCalls[i];
    // Create each call (storage will add timestamps)
    await storage.createCall(call);
  }

  console.log(`Seeded ${sampleCalls.length} sample calls`);
}
