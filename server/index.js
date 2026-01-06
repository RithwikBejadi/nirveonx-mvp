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

    //Fetching available ambulance from database in required city.
    const cityAmbulance = await axios.post(
      "http://localhost:9000/get-city-ambulance",
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
          text: `${para.name}, your prescriped medicines has been booked with PharmXPlus Active Service.
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
    console.log(healthProfessonal)
    let professionalName = "";
    if(healthProfessonal == "doctor") {
       professionalName = "Dr Arun Nayak, MBBS"
    }else if (healthProfessonal == "medical staff" || "clinical staff" || "caretaker") {
      professionalName == "Mr. Ashok Chouhan"
    }else if (healthProfessonal = "nurse") {
      professionalName == "Nurse Mary Jane";
    }
     
    return {
      content: [
        {
          type: "text",
          text: `${para.name}, your appointment has been booked with FastMediX Quick Service.
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

app.listen(4000, () => {
  console.log("Server is running on 4000");
});
