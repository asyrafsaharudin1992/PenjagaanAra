import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export async function summarizeCase(diagnosis: string, remarks: string[]) {
  if (!ai) return "AI features are not configured.";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        Summarize the following medical follow-up case based on the diagnosis and remarks. Suggest next steps for the clinic staff.
        
        Diagnosis: ${diagnosis}
        Remarks: ${remarks.join("\n")}
        
        Provide a concise summary and 3 bullet points for action.
      `,
    });

    return response.text || "No summary generated.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Failed to generate AI summary.";
  }
}

export async function suggestUrgency(diagnosis: string) {
  if (!ai) return "others";

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `
        Based on the following medical diagnosis, classify the patient into one of these follow up categories: 
        "aramommy" (maternity/pregnancy), 
        "arachronic" (chronic diseases like diabetes, hypertension), 
        "arawellness (weight loss)" (weight management/wellness), 
        "referral cases" (specialist referrals), 
        or "others".
        
        Diagnosis: ${diagnosis}
        
        Return only the category name.
      `,
    });

    const text = response.text?.trim().toLowerCase() || "others";
    return text as any;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "others";
  }
}
