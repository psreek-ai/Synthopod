import { GoogleGenAI, Modality, GenerateContentResponse, Type } from "@google/genai";
import { ChatMessage, MessageRole, PodcastData } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generatePodcastScript(
  prompt: string, 
  history: ChatMessage[],
  onStatusUpdate?: (status: string) => void
): Promise<{ title: string; script: string }> {
  const chatHistory = history.map(msg => ({
    role: msg.role === MessageRole.USER ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));

  // Step 1: Brainstorming & Planning
  onStatusUpdate?.("Brainstorming structure and tone...");
  const plannerResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      ...chatHistory,
      { role: 'user', parts: [{ text: `Analyze this podcast prompt: "${prompt}". 
      Create a detailed plan including:
      1. A catchy title.
      2. The overall tone (e.g., humorous, serious, educational).
      3. A 3-point outline.
      4. Key facts or themes to cover.` }] }
    ],
  });
  const plan = plannerResponse.text || "";

  // Step 2: Parallel Research/Perspective Generation
  onStatusUpdate?.("Developing unique perspectives...");
  const [hostPoints, guestPoints] = await Promise.all([
    ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `Based on this plan: ${plan}\n\nGenerate 3 unique, engaging points or questions the HOST should bring up to keep the conversation lively.` }] }]
    }),
    ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `Based on this plan: ${plan}\n\nGenerate 3 unique, insightful points or anecdotes the GUEST should share to add depth.` }] }]
    })
  ]);

  // Step 3: Script Drafting
  onStatusUpdate?.("Drafting the full script...");
  const draftResponse = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      ...chatHistory,
      { role: 'user', parts: [{ text: `Using the following research and plan, write a short, engaging podcast script (1-2 minutes).
      
      PLAN: ${plan}
      HOST PERSPECTIVE: ${hostPoints.text}
      GUEST PERSPECTIVE: ${guestPoints.text}
      
      The script should be a natural conversation between "Host:" and "Guest:". 
      Ensure it's suitable for text-to-speech (no complex stage directions).` }] }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          script: { type: Type.STRING }
        },
        required: ["title", "script"]
      }
    },
  });

  // Step 4: Final Polish
  onStatusUpdate?.("Polishing for audio synthesis...");
  try {
    const text = draftResponse.text || '{}';
    const cleanJson = text.replace(/```json\n?|```/g, '').trim();
    const result = JSON.parse(cleanJson);
    
    // One final quick pass to ensure TTS labels are clean
    const polishedResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: `Clean up this podcast script for Text-to-Speech. 
      Ensure every line starts with either "Host:" or "Guest:". 
      Remove any parenthetical directions like (laughs) or [music fades].
      
      SCRIPT: ${result.script}` }] }]
    });

    return {
      title: result.title || "Untitled Podcast",
      script: polishedResponse.text || result.script
    };
  } catch (e) {
    console.error("Failed to parse script JSON", e);
    return {
      title: "Untitled Podcast",
      script: draftResponse.text || "No script generated."
    };
  }
}

export async function generatePodcastAudio(script: string): Promise<string> {
  // Clean up script for TTS - remove markdown bolding etc that might confuse TTS
  const cleanScript = script.replace(/\*\*/g, '').replace(/#/g, '').trim();
  
  // Check if script has multiple speakers
  // We look for "Host:" or "Guest:" at the start of lines
  const hasMultipleSpeakers = /(^|\n)(Host|Guest):/i.test(cleanScript);

  const config: any = {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: 'Zephyr' },
      },
    },
  };

  if (hasMultipleSpeakers) {
    config.speechConfig = {
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: [
          {
            speaker: 'Host',
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
          },
          {
            speaker: 'Guest',
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          }
        ]
      }
    };
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: cleanScript }] }],
      config,
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      // Try one more time with single speaker if multi-speaker failed
      if (hasMultipleSpeakers) {
        console.warn("Multi-speaker TTS failed, falling back to single speaker");
        return generatePodcastAudio(cleanScript.replace(/(Host|Guest):/gi, ''));
      }
      throw new Error("Failed to generate audio: No audio data in response");
    }

    return base64Audio;
  } catch (error) {
    console.error("TTS Generation Error:", error);
    throw error;
  }
}
