import Fastify from "fastify";
import WebSocket from "ws";
import dotenv from "dotenv";
import fastifyFormBody from "@fastify/formbody";
import fastifyWs from "@fastify/websocket";

// Load environment variables from .env file
dotenv.config();

// Retrieve the OpenAI API key from environment variables.
const { OPENAI_API_KEY } = process.env;

if (!OPENAI_API_KEY) {
	console.error("Missing OpenAI API key. Please set it in the .env file.");
	process.exit(1);
}

// Initialize Fastify
const fastify = Fastify();
fastify.register(fastifyFormBody);
fastify.register(fastifyWs);

// Constants
// const SYSTEM_MESSAGE = 'You are a helpful and bubbly AI assistant who loves to chat about anything the user is interested about and is prepared to offer them facts. You have a penchant for dad jokes, owl jokes, and rickrolling – subtly. Always stay positive, but work in a joke when appropriate.';
// const SYSTEM_MESSAGE =
// 	"You are a professional and courteous AI receptionist at a hotel. Your role is to warmly greet guests and assist them in selecting a room that best fits their preferences and needs. You are knowledgeable about room types, amenities, views, and special offers, and you help guide guests to the perfect choice with clear, helpful explanations. Stay friendly, respectful, and patient, providing helpful details and recommendations as requested. You should start speaking in the language of the caller, and if they switch languages, you should switch as well. If the caller asks for a specific room type, you should provide a detailed description of that room type, including any special features or amenities. If the caller asks for a recommendation, you should provide a thoughtful suggestion based on their preferences and needs. If the caller asks for more information, you should provide additional details to help them make an informed decision.";
const SYSTEM_MESSAGE = `
You are an AI receptionist for Farhan's Hotel, dedicated to providing accurate information and helping guests select the best room. Use only the details below to answer any questions, and do not add any other information or random data. Here is the information about the hotel:

{
  "hotel_name": "Farhan's Hotel",
  "address": "123 Oceanfront Drive, Miami Beach, FL 33139",
  "contact_info": {
    "phone": "+1 305-555-1234",
    "email": "contact@farhanshotel.com",
    "website": "https://www.farhanshotel.com"
  },
  "description": "A luxurious beachfront hotel offering stunning ocean views, world-class amenities, and exceptional service.",
  "rooms": [
    {
      "type": "Standard Room",
      "description": "A cozy room with one queen-sized bed, ideal for solo travelers or couples.",
      "price_per_night": 150,
      "amenities": ["Free WiFi", "Flat-screen TV", "Air conditioning", "Mini fridge"]
    },
    {
      "type": "Deluxe Room",
      "description": "Spacious room with a king-sized bed and a balcony with ocean views.",
      "price_per_night": 250,
      "amenities": ["Free WiFi", "Flat-screen TV", "Air conditioning", "Mini fridge", "Balcony with ocean view"]
    },
    {
      "type": "Suite",
      "description": "A large suite with a separate living area, perfect for families or extended stays.",
      "price_per_night": 400,
      "amenities": ["Free WiFi", "Flat-screen TV", "Air conditioning", "Mini fridge", "Living room area", "Kitchenette"]
    }
  ],
  "facilities": [
    "Outdoor swimming pool",
    "Fitness center",
    "Spa and wellness center",
    "24-hour concierge",
    "On-site restaurant and bar",
    "Business center"
  ],
  "policies": {
    "check_in": "3:00 PM",
    "check_out": "11:00 AM",
    "cancellation": "Free cancellation up to 24 hours before check-in.",
    "pets": "Pets are allowed with an additional fee."
  },
  "nearby_attractions": [
    {"name": "Miami Beach", "distance": "0.1 miles"},
    {"name": "Ocean Drive", "distance": "0.3 miles"},
    {"name": "Art Deco Historic District", "distance": "0.5 miles"}
  ]
}

Respond only with the provided information and refrain from speculating or adding details outside of this data. As soon as the user switches languages, you should switch as well. If the user asks for a specific room type, provide a detailed description of that room type, including any special features or amenities. If the user asks for a recommendation, provide a thoughtful suggestion based on their preferences and needs. If the user asks for more information, provide additional details to help them make an informed decision. If you are taking some time while switching language, use some human filler words like "um" or "uh" to make it sound more natural.
`;


const VOICE = "alloy";
const PORT = process.env.PORT || 5050; // Allow dynamic port assignment

// List of Event Types to log to the console. See the OpenAI Realtime API Documentation: https://platform.openai.com/docs/api-reference/realtime
const LOG_EVENT_TYPES = [
	"error",
	"response.content.done",
	"rate_limits.updated",
	"response.done",
	"input_audio_buffer.committed",
	"input_audio_buffer.speech_stopped",
	"input_audio_buffer.speech_started",
	"session.created",
];

// Show AI response elapsed timing calculations
const SHOW_TIMING_MATH = false;

// Root Route
fastify.get("/", async (request, reply) => {
	reply.send({ message: "Twilio Media Stream Server is running!" });
});

// Route for Twilio to handle incoming calls
// <Say> punctuation to improve text-to-speech translation
// fastify.all('/incoming-call', async (request, reply) => {
//     const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
//                           <Response>
//                               <Say>Please wait while we connect your call to the A. I. voice assistant, powered by Twilio and the Open-A.I. Realtime API</Say>
//                               <Pause length="1"/>
//                               <Say>O.K. you can start talking!</Say>
//                               <Connect>
//                                   <Stream url="wss://${request.headers.host}/media-stream" />
//                               </Connect>
//                           </Response>`;

//     reply.type('text/xml').send(twimlResponse);
// });

fastify.all("/incoming-call", async (request, reply) => {
	// const twimlResponse = `
    //     <?xml version="1.0" encoding="UTF-8"?>
    //     <Response>
    //         <Say voice="alice">Welcome to our hotel. Please hold while I connect you with our AI receptionist, here to assist you in selecting the perfect room.</Say>
    //         <Pause length="1"/>
    //         <Say voice="alice">Alright, feel free to start sharing your preferences now!</Say>
    //         <Connect>
    //             <Stream url="wss://${request.headers.host}/media-stream"/>
    //         </Connect>
    //     </Response>
    // `;
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Welcome to our hotel. Please hold while I connect you with our AI receptionist, here to assist you in selecting the perfect room.</Say><Pause length="1"/><Say voice="alice">Alright, feel free to start sharing your preferences now!</Say><Connect><Stream url="wss://${request.headers.host}/media-stream"/></Connect></Response>`;


	reply.type("text/xml").send(twimlResponse);
});

// WebSocket route for media-stream
fastify.register(async (fastify) => {
	fastify.get("/media-stream", { websocket: true }, (connection, req) => {
		console.log("Client connected");

		// Connection-specific state
		let streamSid = null;
		let latestMediaTimestamp = 0;
		let lastAssistantItem = null;
		let markQueue = [];
		let responseStartTimestampTwilio = null;

		const openAiWs = new WebSocket(
			"wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01",
			{
				headers: {
					Authorization: `Bearer ${OPENAI_API_KEY}`,
					"OpenAI-Beta": "realtime=v1",
				},
			}
		);

		// Control initial session with OpenAI
		const initializeSession = () => {
			const sessionUpdate = {
				type: "session.update",
				session: {
					turn_detection: { type: "server_vad" },
					input_audio_format: "g711_ulaw",
					output_audio_format: "g711_ulaw",
					voice: VOICE,
					instructions: SYSTEM_MESSAGE,
					modalities: ["text", "audio"],
					temperature: 0.8,
				},
			};

			console.log("Sending session update:", JSON.stringify(sessionUpdate));
			openAiWs.send(JSON.stringify(sessionUpdate));

			// Uncomment the following line to have AI speak first:
			sendInitialConversationItem();
		};

		// Send initial conversation item if AI talks first
		const sendInitialConversationItem = () => {
			const initialConversationItem = {
				type: "conversation.item.create",
				item: {
					type: "message",
					role: "user",
					content: [
						{
							type: "input_text",
							text: "Hello!, how can I help you today?",
						},
					],
				},
			};

			if (SHOW_TIMING_MATH)
				console.log(
					"Sending initial conversation item:",
					JSON.stringify(initialConversationItem)
				);
			openAiWs.send(JSON.stringify(initialConversationItem));
			openAiWs.send(JSON.stringify({ type: "response.create" }));
		};

		// Handle interruption when the caller's speech starts
		const handleSpeechStartedEvent = () => {
			if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
				const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
				if (SHOW_TIMING_MATH)
					console.log(
						`Calculating elapsed time for truncation: ${latestMediaTimestamp} - ${responseStartTimestampTwilio} = ${elapsedTime}ms`
					);

				if (lastAssistantItem) {
					const truncateEvent = {
						type: "conversation.item.truncate",
						item_id: lastAssistantItem,
						content_index: 0,
						audio_end_ms: elapsedTime,
					};
					if (SHOW_TIMING_MATH)
						console.log(
							"Sending truncation event:",
							JSON.stringify(truncateEvent)
						);
					openAiWs.send(JSON.stringify(truncateEvent));
				}

				connection.send(
					JSON.stringify({
						event: "clear",
						streamSid: streamSid,
					})
				);

				// Reset
				markQueue = [];
				lastAssistantItem = null;
				responseStartTimestampTwilio = null;
			}
		};

		// Send mark messages to Media Streams so we know if and when AI response playback is finished
		const sendMark = (connection, streamSid) => {
			if (streamSid) {
				const markEvent = {
					event: "mark",
					streamSid: streamSid,
					mark: { name: "responsePart" },
				};
				connection.send(JSON.stringify(markEvent));
				markQueue.push("responsePart");
			}
		};

		// Open event for OpenAI WebSocket
		openAiWs.on("open", () => {
			console.log("Connected to the OpenAI Realtime API");
			setTimeout(initializeSession, 100);
		});

		// Listen for messages from the OpenAI WebSocket (and send to Twilio if necessary)
		openAiWs.on("message", (data) => {
			try {
				const response = JSON.parse(data);

				if (LOG_EVENT_TYPES.includes(response.type)) {
					console.log(`Received event: ${response.type}`, response);
				}

				if (response.type === "response.audio.delta" && response.delta) {
					const audioDelta = {
						event: "media",
						streamSid: streamSid,
						media: {
							payload: Buffer.from(response.delta, "base64").toString("base64"),
						},
					};
					connection.send(JSON.stringify(audioDelta));

					// First delta from a new response starts the elapsed time counter
					if (!responseStartTimestampTwilio) {
						responseStartTimestampTwilio = latestMediaTimestamp;
						if (SHOW_TIMING_MATH)
							console.log(
								`Setting start timestamp for new response: ${responseStartTimestampTwilio}ms`
							);
					}

					if (response.item_id) {
						lastAssistantItem = response.item_id;
					}

					sendMark(connection, streamSid);
				}

				if (response.type === "input_audio_buffer.speech_started") {
					handleSpeechStartedEvent();
				}
			} catch (error) {
				console.error(
					"Error processing OpenAI message:",
					error,
					"Raw message:",
					data
				);
			}
		});

		// Handle incoming messages from Twilio
		connection.on("message", (message) => {
			try {
				const data = JSON.parse(message);

				switch (data.event) {
					case "media":
						latestMediaTimestamp = data.media.timestamp;
						if (SHOW_TIMING_MATH)
							console.log(
								`Received media message with timestamp: ${latestMediaTimestamp}ms`
							);
						if (openAiWs.readyState === WebSocket.OPEN) {
							const audioAppend = {
								type: "input_audio_buffer.append",
								audio: data.media.payload,
							};
							openAiWs.send(JSON.stringify(audioAppend));
						}
						break;
					case "start":
						streamSid = data.start.streamSid;
						console.log("Incoming stream has started", streamSid);

						// Reset start and media timestamp on a new stream
						responseStartTimestampTwilio = null;
						latestMediaTimestamp = 0;
						break;
					case "mark":
						if (markQueue.length > 0) {
							markQueue.shift();
						}
						break;
					default:
						console.log("Received non-media event:", data.event);
						break;
				}
			} catch (error) {
				console.error("Error parsing message:", error, "Message:", message);
			}
		});

		// Handle connection close
		connection.on("close", () => {
			if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
			console.log("Client disconnected.");
		});

		// Handle WebSocket close and errors
		openAiWs.on("close", () => {
			console.log("Disconnected from the OpenAI Realtime API");
		});

		openAiWs.on("error", (error) => {
			console.error("Error in the OpenAI WebSocket:", error);
		});
	});
});

fastify.listen({ port: PORT }, (err) => {
	if (err) {
		console.error(err);
		process.exit(1);
	}
	console.log(`Server is listening on port ${PORT}`);
});
