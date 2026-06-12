import type { APIRoute } from "astro";

export const prerender = false;

const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";
const LEGACY_WEB3FORMS_ACCESS_KEY = "c2b11354-96b5-4644-89d4-741b5fed9d63";
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const MIN_FORM_FILL_MS = 2500;
const MAX_FORM_AGE_MS = 2 * 60 * 60 * 1000;

const rateLimit = new Map<string, { count: number; resetAt: number }>();

const allowedServices = new Set([
  "Website leads / sales follow-up",
  "Customer service workflow",
  "Accessory reminders",
  "China export readiness",
  "Tax/accounting partner coordination",
  "Not sure yet",
]);

const spamPatterns = [
  /\bseo\b/i,
  /\bbacklinks?\b/i,
  /\bcasino\b/i,
  /\bcrypto(?:currency)?\b/i,
  /\bviagra\b/i,
  /\brank(?:ing)?\s+on\s+google\b/i,
  /\bguest\s+post\b/i,
  /\btelegram\b/i,
];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  return forwardedFor?.split(",")[0]?.trim() || realIp || "unknown";
}

function isRateLimited(ip: string) {
  const now = Date.now();
  const current = rateLimit.get(ip);

  if (!current || current.resetAt <= now) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  current.count += 1;
  return current.count > RATE_LIMIT_MAX;
}

function valueFrom(payload: Record<string, unknown>, key: string, maxLength = 2000) {
  const value = payload[key];

  if (typeof value !== "string") {
    return "";
  }

  return value.trim().slice(0, maxLength);
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  }

  const formData = await request.formData();
  return Object.fromEntries(formData.entries());
}

function countUrls(value: string) {
  return value.match(/(?:https?:\/\/|www\.)\S+/gi)?.length || 0;
}

function cleanPageUrl(value: string) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isAllowedHost =
      host === "jydream.ca" ||
      host === "www.jydream.ca" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".vercel.app");

    return isAllowedHost ? url.toString() : "";
  } catch {
    return "";
  }
}

function getSpamReasons(payload: Record<string, unknown>) {
  const reasons: string[] = [];
  const botcheck = valueFrom(payload, "botcheck", 20);
  const websiteUrl = valueFrom(payload, "website_url", 300);
  const loadedAt = Number(valueFrom(payload, "form_started_at", 32));
  const now = Date.now();
  const combinedText = [
    valueFrom(payload, "name", 120),
    valueFrom(payload, "email", 254),
    valueFrom(payload, "company", 200),
    valueFrom(payload, "message", 4000),
  ].join(" ");

  if (botcheck || websiteUrl) {
    reasons.push("honeypot");
  }

  if (!Number.isFinite(loadedAt)) {
    reasons.push("missing-timestamp");
  } else if (now - loadedAt < MIN_FORM_FILL_MS) {
    reasons.push("too-fast");
  } else if (now - loadedAt > MAX_FORM_AGE_MS) {
    reasons.push("stale-form");
  }

  if (countUrls(combinedText) >= 3) {
    reasons.push("too-many-links");
  }

  if (spamPatterns.some((pattern) => pattern.test(combinedText)) && countUrls(combinedText) > 0) {
    reasons.push("known-spam-pattern");
  }

  return reasons;
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const clientIp = getClientIp(request);
    const payload = await readPayload(request);
    const spamReasons = getSpamReasons(payload);

    if (isRateLimited(clientIp)) {
      return jsonResponse({ success: false, message: "Too many requests. Please try again later." }, 429);
    }

    if (spamReasons.length > 0) {
      console.warn("Dropped contact form spam submission", { reasons: spamReasons, clientIp });
      return jsonResponse({ success: true, message: "Thanks, your request was sent." });
    }

    const name = valueFrom(payload, "name", 100);
    const email = valueFrom(payload, "email", 254);
    const company = valueFrom(payload, "company", 160);
    const serviceNeed = valueFrom(payload, "service_need", 120);
    const message = valueFrom(payload, "message", 2500);
    const pageUrl = cleanPageUrl(valueFrom(payload, "page_url", 500));
    const errors: string[] = [];

    if (name.length < 2) {
      errors.push("Please provide your full name.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Please provide a valid email address.");
    }

    if (!allowedServices.has(serviceNeed)) {
      errors.push("Please choose one area.");
    }

    if (message.length < 20) {
      errors.push("Please include a little more detail.");
    }

    if (errors.length > 0) {
      return jsonResponse({ success: false, message: errors[0], details: errors }, 400);
    }

    const accessKey = import.meta.env.WEB3FORMS_ACCESS_KEY || LEGACY_WEB3FORMS_ACCESS_KEY;
    const response = await fetch(WEB3FORMS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        access_key: accessKey,
        from_website: "JYDream Free Pilot Request",
        subject: "New JYDream free pilot request",
        name,
        email,
        company,
        service_need: serviceNeed,
        message,
        page_url: pageUrl,
        submitted_at: new Date().toISOString(),
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || data.success === false) {
      console.error("Web3Forms contact submission failed", data);
      return jsonResponse(
        { success: false, message: "Could not send right now. Please email ted@jydream.ca." },
        502
      );
    }

    return jsonResponse({
      success: true,
      message: "Thanks, your request was sent.",
    });
  } catch (error) {
    console.error("Contact form submission failed", error);
    return jsonResponse(
      { success: false, message: "Could not send right now. Please email ted@jydream.ca." },
      500
    );
  }
};
