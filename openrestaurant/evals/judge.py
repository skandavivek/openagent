"""LLM-as-judge for a case's natural-language conversation criterion.

This is the "component 1" ground truth: does the actual back-and-forth
conversation (not the tool calls -- see matcher.py for that) satisfy a
plain-English description of what should have happened.
"""
import json
from pathlib import Path

from anthropic import Anthropic
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / "chat_service" / ".env")

JUDGE_MODEL = "claude-haiku-4-5-20251001"

client = Anthropic()

JUDGE_SYSTEM = """You are a strict, impartial QA judge for a restaurant-booking chatbot.
You will be shown a conversation between a guest and the assistant, a trace of backend
tool calls the assistant made, and a ground-truth criterion the conversation must satisfy.
Decide whether the criterion is satisfied. Respond with ONLY a JSON object of the form
{"pass": true or false, "reasoning": "<= 20 words justification"}.
Keep "reasoning" to at most one short sentence (20 words or fewer) so the response is
never truncated. Be strict: if the assistant fabricates information, confirms something
it shouldn't have, or fails to do something the criterion requires, mark it as failing."""


def judge_conversation(transcript: list, tool_trace: list, criterion: str) -> dict:
    transcript_text = "\n".join(f"{t['role'].upper()}: {t['content']}" for t in transcript)
    trace_text = json.dumps(tool_trace, indent=2) if tool_trace else "(no tool calls)"

    user_prompt = f"""CONVERSATION:
{transcript_text}

TOOL CALLS MADE:
{trace_text}

CRITERION TO CHECK:
{criterion}

Does the conversation satisfy the criterion? Respond with only the JSON object."""

    response = client.messages.create(
        model=JUDGE_MODEL,
        max_tokens=500,
        system=JUDGE_SYSTEM,
        messages=[{"role": "user", "content": user_prompt}],
    )
    text = "".join(b.text for b in response.content if b.type == "text").strip()

    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {"pass": False, "reasoning": f"Judge returned unparseable output: {text[:200]}"}
