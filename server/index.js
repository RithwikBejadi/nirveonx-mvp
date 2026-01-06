//1.1
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import { config } from "dotenv";
import axios from "axios";
import { he } from "zod/locales";
config();

//1.2
const server = new McpServer({
  name: "nirveonx-mcp-server",
  version: "1.0.0",
});

const app = express();

// Enable CORS for all routes
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
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
      { city }
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
  }
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
      llmOption
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
  }
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
  }
);

//1.3
const transports = {};

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

// Add simple HTTP REST endpoints for direct tool calls (React Native compatible)
app.use(express.json());

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

app.post("/tool/PharmXPlus", async (req, res) => {
  try {
    const { name, phoneNumber, address, prescriptionImageURL } = req.body;
    res.json({
      message: `🎉 Order placed successfully with PharmXPlus!

**Order Confirmation**
Order ID: #PX${Date.now()}
Patient: ${name}
Contact: ${phoneNumber}
Delivery Address: ${address}

**Prescribed Medications:**
1. Paracetamol 500mg - 10 tablets
2. Amoxicillin 250mg - 6 capsules

**Prescription:**
📋 ${prescriptionImageURL}

**Payment Summary**
• Medicines: ₹450
• Delivery: ₹50
Total: ₹500 (Five hundred only)

Estimated Delivery: 45-60 minutes
Track your order: pharmxplus.com/track`,
    });
  } catch (error) {
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
    const { message } = req.body;

    if (!message) {
      return res.json({ message: "Please send a message!" });
    }

    console.log("Chat received:", message);

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
              content: `You are NirveonX AI, a healthcare assistant. Analyze user messages and respond in JSON format.

Available services:
1. AmboRapid - Emergency ambulance booking
2. PharmXPlus - Medicine/prescription delivery
3. FastMediX - Doctor/nurse appointments

For service requests, respond with:
{
  "intent": "amborapid" | "pharmxplus" | "fastmedix" | "general",
  "params": {
    "name": "extracted name or null",
    "phoneNumber": "10 digit number or null",
    "city": "city name or Hyderabad",
    "address": "address or null",
    "healthProfessional": "doctor/nurse or null"
  },
  "response": "Your friendly response to the user",
  "needsMoreInfo": true/false,
  "missingFields": ["list of missing required fields"]
}

For general chat (greetings, questions about services), respond with:
{
  "intent": "general",
  "response": "Your helpful response explaining services"
}

Be warm, helpful, and professional. If user asks to book something, try to help them.`,
            },
            {
              role: "user",
              content: message,
            },
          ],
        }),
      }
    );

    const llmData = await llmResponse.json();
    const aiContent = llmData.choices?.[0]?.message?.content || "";

    console.log("AI Response:", aiContent);

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
