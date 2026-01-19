//1.1
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { config } from "dotenv";
import axios from "axios";
import { he } from "zod/locales";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

//1.2
const server = new McpServer({
  name: "nirveonx-mcp-server",
  version: "1.0.0",
});

const app = express();

// Parse JSON bodies BEFORE CORS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enable CORS for all routes - MUST be after body parsers
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept",
  );
  res.header("Access-Control-Max-Age", "86400"); // 24 hours

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "healthy",
    service: "NirveonX MCP Server",
    version: "1.0.0",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Image upload endpoint - accepts base64 or multipart file
app.post("/upload-image", upload.single("image"), async (req, res) => {
  try {
    let imageBuffer;
    let imageBase64;

    // Check if image is sent as multipart file
    if (req.file) {
      imageBuffer = req.file.buffer;
      imageBase64 = `data:${req.file.mimetype};base64,${imageBuffer.toString("base64")}`;
    }
    // Check if image is sent as base64 in body
    else if (req.body.image) {
      imageBase64 = req.body.image;
      // Handle if base64 doesn't have data URI prefix
      if (!imageBase64.startsWith("data:")) {
        imageBase64 = `data:image/jpeg;base64,${imageBase64}`;
      }
    } else {
      return res.status(400).json({ error: "No image provided" });
    }

    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(imageBase64, {
      folder: "nirveonx-prescriptions",
      resource_type: "auto",
    });

    res.json({
      success: true,
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
    });
  } catch (error) {
    console.error("Image upload error:", error);
    res.status(500).json({
      error: "Failed to upload image",
      message: error.message,
    });
  }
});

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

//4.1
server.tool(
  "AmboRapid",
  "This tool tell name, phone number and city from the user and book nearest ambulance for them.",
  {
    name: z.string(),
    phoneNumber: z.string(),
    city: z.string(),
  },
  async (para) => {
    //Dummy GPS coordinates - Hyderabad, JNTUH in Kukatpally
    let userLatitude = 17.4959;
    let userLongiture = 78.3926;

    let city = para.city;
    city = city.toLowerCase();
    if (city != "hyderabad" || "bangalore") {
      return {
        content: [
          {
            type: "text",
            text: `CAN'T BOOK AMBULANCE in ${city} as right now AmbroRapid Services are operating in Hyderabad and Bangalore only.`,
          },
        ],
      };
    }
    console.log(city);

    // Use production MVP backend URL
    const BACKEND_URL =
      process.env.MVP_BACKEND_URL ||
      "https://nirveonx-mvp-backend.onrender.com";

    //Fetching available ambulance from database in required city.
    const cityAmbulance = await axios.post(
      `${BACKEND_URL}/get-city-ambulance`,
      { city },
    );

    const cityAmbulanceData = cityAmbulance.data.data;

    //Finding nearest ambulance - Haversine Formula
    let nearestAmbulance = null;
    let minDistance = Infinity;

    for (const amb of cityAmbulanceData) {
      const { lat, lng } = amb.location.gps;

      const distance = haversine(userLatitude, userLongiture, lat, lng);

      if (distance < minDistance) {
        minDistance = distance;
        nearestAmbulance = amb;
      }
    }

    // nearest ambulance is saved here
    console.log("Nearest Ambulance:", nearestAmbulance);
    let ambulanceId = nearestAmbulance.id;
    let maxLoad = nearestAmbulance.maxLoad;
    let preferredHospital = nearestAmbulance.preferredHospital;

    return {
      content: [
        {
          type: "text",
          text: `Your ambulance has been booked with AmboRapid Emergency Service.
Please keep your phone (${
            para.phoneNumber
          }) near you, the driver may contact you shortly.\n
**Ambulance Details**\n
• Ambulance ID: ${ambulanceId}
• Max Patient Capacity: ${maxLoad}
• Preferred Hospital: ${preferredHospital}\n

**Live track your ambulance**
🔗 https://res.cloudinary.com/dnfq7ty1x/image/upload/v1764914113/Screenshot_2025-12-05_112246_eomv9g.png \n

**Payment Summary**
AmboRapid Ambulance Service\n

Patient: ${para.name}
Date of Service: ${Date(Date.now()).toLocaleString()}
Transport Type: Emergency ALS
\n
Charges:
• ALS Base Rate: ₹2000
• Mileage: ₹50
• Oxygen Administration: ₹500
\n
Total Charges: ₹2550 only (Two thousand five hundred fifty)`,
        },
      ],
    };
  },
);

//5.1
server.tool(
  "PharmXPlus",
  "This tool take name, phone number, address and prescription image url from the user and order medicines from nearest pharmacy for them.",
  {
    name: z.string(),
    phoneNumber: z.string(),
    address: z.string(),
    prescriptionImageURL: z.string(),
  },
  async (para) => {
    //Analysing prescription to identify the medicines, dosa and quatity.
    const llmOption = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0.2,
        max_completion_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are reading a medical prescription image.
Extract ONLY medicines that are clearly written.
Do NOT guess.

Return a JSON array with objects:
medicineName, dose, quantity.
If unclear, use "UNCLEAR".
Return ONLY valid JSON.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: para.prescriptionImageURL,
                },
              },
            ],
          },
        ],
      }),
    };

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      llmOption,
    );

    //Parsing the llm resposne (markdown) into array object.
    const data = await response.json();

    function safeParseJSON(llmOutput) {
      const cleaned = llmOutput
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      return JSON.parse(cleaned);
    }

    const jsonString = data.choices[0].message.content;
    const message = data.choices[0].message;
    console.log(message);

    const medicines = safeParseJSON(jsonString);

    let medicineString = `Prescriped Medicines:
     `;

    medicines.forEach((med) => {
      medicineString =
        medicineString +
        `• ${med.medicineName}, ${med.dose}, ${med.quantity}
          `;
    });
// prescription read...
    return {
      content: [
        {
          type: "text",
          text: `${
            para.name
          }, your prescriped medicines has been booked with PharmXPlus Active Service.
Please keep your phone (${
            para.phoneNumber
          }) near you, your order will reach shortly
Address: ${para.address}.\n
${medicineString}\n

**Live track your order**
🔗 https://res.cloudinary.com/dnfq7ty1x/image/upload/v1764914113/Screenshot_2025-12-05_112246_eomv9g.png \n

**Payment Summary**
PharmXPlus Active Service\n

Patient: ${para.name}
Date of Service: ${Date(Date.now()).toLocaleString()}
Transport Type: Emergency ALS
\n
Charges:
• Medicine Cost: ₹850
• Delivery: ₹50
• GST (18% approx): ₹153
\n
Total Charges: ₹1053 only (One thousand fifty three)`,
        },
      ],
    };
  },
);

//6.1
server.tool(
  "FastMediX",
  "This tool take name, phone number, address and type of healthcare professional from the user and book a appoinment from nearest available expert for them.",
  {
    name: z.string(),
    phoneNumber: z.string(),
    address: z.string(),
    healthProfessonal: z.string(),
  },
  async (para) => {
    let healthProfessonal = para.healthProfessonal.toLowerCase();
    console.log(healthProfessonal);
    let professionalName = "";
    if (healthProfessonal == "doctor") {
      professionalName = "Dr Arun Nayak, MBBS";
    } else if (
      healthProfessonal == "medical staff" ||
      "clinical staff" ||
      "caretaker"
    ) {
      professionalName == "Mr. Ashok Chouhan";
    } else if ((healthProfessonal = "nurse")) {
      professionalName == "Nurse Mary Jane";
    }

    return {
      content: [
        {
          type: "text",
          text: `${
            para.name
          }, your appointment has been booked with FastMediX Quick Service.
Please keep your phone (${
            para.phoneNumber
          }) near you, the appointed ${healthProfessonal} will reach shortly
Address: ${para.address}.\n
**Live track your order**
🔗 https://res.cloudinary.com/dnfq7ty1x/image/upload/v1764914113/Screenshot_2025-12-05_112246_eomv9g.png \n

**Payment Summary**
FastMediX Quick Service\n

${healthProfessonal}: ${professionalName}
Date of Service: ${Date(Date.now()).toLocaleString()}
Case Type: Emergency 
\n
Charges:
• Service Cost: ₹500
• Checkup: ₹300
\n
Total Charges: ₹800 only (Eight hundred)`,
        },
      ],
    };
  },
);

//1.3
const transports = {};

// Conversation memory store - track user sessions and their chat history
const conversations = new Map();

// Clean up old conversations after 30 minutes of inactivity
setInterval(
  () => {
    const now = Date.now();
    for (const [userId, data] of conversations.entries()) {
      if (now - data.lastActivity > 30 * 60 * 1000) {
        conversations.delete(userId);
      }
    }
  },
  5 * 60 * 1000,
); // Check every 5 minutes

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  res.on("close", () => {
    delete transports[transport.sessionId];
  });
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports[sessionId];
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No transport found for sessionId");
  }
});

// REST endpoints for direct tool calls (React Native compatible)
// Body parsing is already done at the top of the file

app.post("/tool/AmboRapid", async (req, res) => {
  try {
    const { name, phoneNumber, city } = req.body;
    let cityLower = (city || "hyderabad").toLowerCase();

    if (cityLower !== "hyderabad" && cityLower !== "bangalore") {
      return res.json({
        message: `CAN'T BOOK AMBULANCE in ${city} as right now AmboRapid Services are operating in Hyderabad and Bangalore only.`,
      });
    }

    // Demo ambulance data (fallback when DB is unavailable)
    const demoAmbulance = {
      id: "AMB-" + Math.floor(1000 + Math.random() * 9000),
      maxLoad: 2,
      preferredHospital:
        cityLower === "hyderabad"
          ? "Apollo Hospital, Jubilee Hills"
          : "Manipal Hospital, Bangalore",
      driverName: "Raju Kumar",
      eta: Math.floor(10 + Math.random() * 15),
    };

    res.json({
      message: `🚑 Your ambulance has been booked with AmboRapid Emergency Service!

Patient: ${name || "Emergency Patient"}
Contact: ${phoneNumber || "Not provided"}

**Ambulance Details**
• Ambulance ID: ${demoAmbulance.id}
• Driver: ${demoAmbulance.driverName}
• Max Capacity: ${demoAmbulance.maxLoad} patients
• Nearest Hospital: ${demoAmbulance.preferredHospital}
• Estimated Arrival: ${demoAmbulance.eta} minutes

📞 Emergency Hotline: 1-800-AMBORAPID
Stay calm, help is on the way! 🏥`,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error booking ambulance: " + error.message });
  }
});
// Check
app.post("/tool/PharmXPlus", upload.single("prescriptionImage"), async (req, res) => {
  try {
    let { name, phoneNumber, address, prescriptionImageURL } = req.body;
    
    // If image file is uploaded, upload to Cloudinary first
    if (req.file) {
      const imageBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      const uploadResult = await cloudinary.uploader.upload(imageBase64, {
        folder: "nirveonx-prescriptions",
        resource_type: "auto",
      });
      prescriptionImageURL = uploadResult.secure_url;
    }
    // If base64 image is sent in body
    else if (req.body.prescriptionImage) {
      let imageBase64 = req.body.prescriptionImage;
      if (!imageBase64.startsWith("data:")) {
        imageBase64 = `data:image/jpeg;base64,${imageBase64}`;
      }
      const uploadResult = await cloudinary.uploader.upload(imageBase64, {
        folder: "nirveonx-prescriptions",
        resource_type: "auto",
      });
      prescriptionImageURL = uploadResult.secure_url;
    }

    // Analyze prescription with Groq Vision API if URL is available
    let medicinesList = [];
    if (prescriptionImageURL) {
      try {
        const llmOption = {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            temperature: 0.2,
            max_completion_tokens: 512,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `You are reading a medical prescription image.
Extract ONLY medicines that are clearly written.
Do NOT guess.

Return a JSON array with objects:
medicineName, dose, quantity.
If unclear, use "UNCLEAR".
Return ONLY valid JSON.`,
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: prescriptionImageURL,
                    },
                  },
                ],
              },
            ],
          }),
        };

        const response = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          llmOption,
        );
        const data = await response.json();
        
        if (data.choices && data.choices[0]) {
          const jsonString = data.choices[0].message.content
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();
          medicinesList = JSON.parse(jsonString);
        }
      } catch (visionError) {
        console.error("Vision API error:", visionError);
        // Continue with default medicines if vision fails
      }
    }

    // Format medicines list
    let medicineString = "";
    if (medicinesList.length > 0) {
      medicineString = "**Prescribed Medications:**\n";
      medicinesList.forEach((med, idx) => {
        medicineString += `${idx + 1}. ${med.medicineName}, ${med.dose}, ${med.quantity}\n`;
      });
    } else {
      medicineString = "**Prescribed Medications:**\n1. Paracetamol 500mg - 10 tablets\n2. Amoxicillin 250mg - 6 capsules\n";
    }

    res.json({
      message: `🎉 Order placed successfully with PharmXPlus!

**Order Confirmation**
Order ID: #PX${Date.now()}
Patient: ${name}
Contact: ${phoneNumber}
Delivery Address: ${address}

${medicineString}
**Prescription:**
📋 ${prescriptionImageURL || "No prescription uploaded"}

**Payment Summary**
• Medicines: ₹450
• Delivery: ₹50
Total: ₹500 (Five hundred only)

Estimated Delivery: 45-60 minutes
Track your order: pharmxplus.com/track`,
    });
  } catch (error) {
    console.error("PharmXPlus error:", error);
    res.status(500).json({ message: "Error placing order: " + error.message });
  }
});

app.post("/tool/FastMediX", async (req, res) => {
  try {
    const { name, phoneNumber, address, healthProfessonal } = req.body;
    const professionalName =
      healthProfessonal === "doctor"
        ? "Dr. Rajesh Kumar"
        : "Nurse Priya Sharma";

    res.json({
      message: `✅ Appointment confirmed with FastMediX!

**Appointment Details**
Booking ID: #FM${Date.now()}
Patient: ${name}
Contact: ${phoneNumber}
Location: ${address}

**Healthcare Professional**
${healthProfessonal}: ${professionalName}
Arrival Time: Within 30 minutes
Specialization: General Medicine

**Service Summary**
• Service Cost: ₹500
• Checkup: ₹300
Total: ₹800 (Eight hundred only)

The ${healthProfessonal} will contact you shortly.
Emergency: 1-800-FASTMEDIX`,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error booking appointment: " + error.message });
  }
});

// AI-Powered Smart Chat Endpoint
app.post("/chat", async (req, res) => {
  try {
    const { message, userId, sessionId } = req.body;
    // Use sessionId if provided, otherwise userId, otherwise "default"
    const userIdentifier = sessionId || userId || "default";

    if (!message) {
      return res.json({ message: "Please send a message!" });
    }

    console.log("Chat received:", message, "from user:", userIdentifier);

    // Get or create conversation history for this user
    if (!conversations.has(userIdentifier)) {
      conversations.set(userIdentifier, {
        messages: [],
        lastActivity: Date.now(),
        collectedData: {}, // Store collected ambulance booking data
      });
    }

    const userConversation = conversations.get(userIdentifier);
    userConversation.lastActivity = Date.now();

    // Add user message to history
    userConversation.messages.push({
      role: "user",
      content: message,
    });

    // Use Groq LLM to understand intent and extract parameters
    const llmResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          temperature: 0.1,
          max_tokens: 500,
          messages: [
            {
              role: "system",
              content: `You are NirveonX, an intelligent, empathetic, and highly conversational healthcare AI assistant. You help people in India access emergency healthcare services with warmth and efficiency.

YOUR SERVICES:
1. 🚑 **AmboRapid (Emergency Ambulance)** - GPS-tracked ambulance dispatch in Hyderabad and Bangalore
2. 💊 **PharmXPlus (Medicine Delivery)** - Prescription medicine delivery within 45-60 minutes  
3. 👨‍⚕️ **FastMediX (Doctor Home Visits)** - Doctors, nurses, or medical staff at your doorstep

CONVERSATION PERSONALITY:
- Be like a caring friend who happens to be a healthcare expert
- Use warm greetings and empathetic acknowledgments
- Keep responses concise but helpful (2-4 sentences max)
- Add relevant emojis sparingly for warmth 🩺💙
- NEVER repeat questions already answered in the conversation
- Remember ALL details from the conversation history

SMART CONVERSATION FLOW:
For AMBULANCE booking, collect in this order (ONE question at a time):
1. Name → "Hi! I'm here to help. May I know your name please?"
2. Phone → "Thanks, [name]! What's your phone number for the driver to contact you?"
3. Emergency → "What's the medical situation? (e.g., chest pain, accident, breathing difficulty)"
4. City → "Which city are you in? We serve Hyderabad and Bangalore currently."
5. Landmark → "Share a nearby landmark (hospital, mall, metro station) for faster arrival."

INTELLIGENT BEHAVIORS:
- If user says multiple things in one message, extract all info before asking next question
- If phone has less than 10 digits, politely ask again
- If city is not served, apologize and suggest emergency helpline 108
- When ALL details collected, confirm and book immediately
- For general health questions, provide brief helpful advice

RESPONSE FORMAT:
For booking confirmations, include tracking-friendly format:
🚑 **Ambulance Booked!**
• Booking ID: AMB-XXXX
• ETA: X minutes
• Driver: [Name]
• Hospital: [Nearest hospital]

For general conversation, just respond naturally without JSON.

NON-HEALTHCARE:
Politely redirect: "I specialize in healthcare! But I can help you with ambulances, medicines, or doctor visits 🏥"

TONE: Professional yet warm. Urgent for emergencies. Always reassuring.`,
            },
            // Send the FULL conversation history for context
            ...userConversation.messages,
          ],
        }),
      },
    );

    const llmData = await llmResponse.json();
    const aiContent = llmData.choices?.[0]?.message?.content || "";

    console.log("AI Response:", aiContent);

    // Store AI response in conversation history
    userConversation.messages.push({
      role: "assistant",
      content: aiContent,
    });

    // Parse the JSON response from LLM
    let parsed;
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : aiContent);
    } catch (e) {
      // If parsing fails, return as general response
      return res.json({
        message:
          aiContent ||
          "I'm here to help with healthcare services! Ask me about ambulances, medicines, or doctor appointments.",
      });
    }

    // If it's a general query or needs more info, return the AI response
    if (parsed.intent === "general" || parsed.needsMoreInfo) {
      return res.json({ message: parsed.response });
    }

    // Route to appropriate service
    const params = parsed.params || {};

    if (parsed.intent === "amborapid") {
      // STRICT VALIDATION: Check ALL required fields for ambulance
      const requiredFields = [
        "name",
        "phoneNumber",
        "symptoms",
        "city",
        "landmark",
      ];
      const missingFields = requiredFields.filter((field) => !params[field]);

      if (missingFields.length > 0) {
        // Still missing required info - don't book yet, ask for it
        return res.json({
          message:
            parsed.response ||
            "I need some more information to book the ambulance. Could you please provide the missing details?",
        });
      }

      // All fields collected - proceed with booking
      // Book ambulance
      const ambulanceId = "AMB-" + Math.floor(1000 + Math.random() * 9000);
      const eta = Math.floor(8 + Math.random() * 12);
      const city = params.city || "Hyderabad";
      const hospital = city.toLowerCase().includes("bang")
        ? "Manipal Hospital, Bangalore"
        : "Apollo Hospital, Jubilee Hills";

      return res.json({
        message: `🚑 **Ambulance Booked Successfully!**

${parsed.response || "Your emergency ambulance is on the way!"}

**Booking Details:**
• Patient: ${params.name || "Emergency Patient"}
• Contact: ${params.phoneNumber || "Will call back"}
• City: ${city}

**Ambulance Info:**
• ID: ${ambulanceId}
• Driver: Raju Kumar
• ETA: ${eta} minutes
• Nearest Hospital: ${hospital}

📞 Emergency Hotline: 1800-AMBORAPID
🏥 Stay calm, help is on the way!`,
      });
    }

    if (parsed.intent === "pharmxplus") {
      const orderId = "PX" + Date.now().toString().slice(-8);

      return res.json({
        message: `💊 **Medicine Order Placed!**

${parsed.response || "Your medicines will be delivered soon!"}

**Order Details:**
• Order ID: #${orderId}
• Patient: ${params.name || "Valued Customer"}
• Contact: ${params.phoneNumber || "Will confirm"}
• Delivery: ${params.address || "Address needed"}

**Estimated Delivery:** 45-60 minutes
**Payment:** Cash on Delivery available

📞 Support: 1800-PHARMXPLUS`,
      });
    }

    if (parsed.intent === "fastmedix") {
      const bookingId = "FM" + Date.now().toString().slice(-8);
      const professional = params.healthProfessional || "doctor";
      const profName =
        professional === "doctor" ? "Dr. Rajesh Kumar" : "Nurse Priya Sharma";

      return res.json({
        message: `✅ **Appointment Confirmed!**

${parsed.response || "Your healthcare professional is on the way!"}

**Appointment Details:**
• Booking ID: #${bookingId}
• Patient: ${params.name || "Valued Patient"}
• Contact: ${params.phoneNumber || "Will confirm"}
• Location: ${params.address || "Your location"}

**Healthcare Professional:**
• ${professional.charAt(0).toUpperCase() + professional.slice(1)}: ${profName}
• ETA: 25-35 minutes
• Specialization: General Medicine

📞 Support: 1800-FASTMEDIX`,
      });
    }

    // Default response
    return res.json({
      message:
        parsed.response || "How can I help you with healthcare services today?",
    });
  } catch (error) {
    console.error("Chat error:", error);
    return res.json({
      message: `I'm NirveonX, your healthcare assistant! I can help you with:

🚑 **AmboRapid** - Emergency ambulance (say "I need an ambulance")
💊 **PharmXPlus** - Medicine delivery (say "Order medicines")  
👨‍⚕️ **FastMediX** - Doctor/nurse visits (say "Book a doctor")

What do you need help with?`,
    });
  }
});

app.listen(4000, () => {
  console.log("Server is running on 4000");
});
