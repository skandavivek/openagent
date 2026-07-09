"""Eval-driven-dev harness for the OpenAgent agent demo.

Before every case, the mock restaurant DB is reset to its pristine seeded
state (same as when the app first starts) so cases are independent and
reproducible regardless of order or prior runs. Each case is then driven
against the *already-running* chat_service over HTTP -- the same path the
real frontend takes -- and checked two ways:

  1. matcher.check_tool_calls   -- deterministic: did the agent call the
     right MCP tools, with the right args, getting the right result shape?
     (ground truth: cases.csv's tool_calls_json / forbidden_tools columns)
  2. judge.judge_conversation   -- LLM-as-judge: does the actual reply text
     satisfy a natural-language description of correct behavior?
     (ground truth: cases.csv's conversation column)

A case only passes if both checks pass. Cases and results are both plain
CSV so they're easy to skim/edit in a spreadsheet; the few genuinely nested
fields (expected tool calls, full transcript/trace) are JSON-encoded within
their cell since there's no clean flat CSV shape for them.

Usage:
    # chat_service must already be running on localhost:8000
    .venv/bin/python evals/run_evals.py [--case-id ID]
"""
import argparse
import csv
import json
import sys
import uuid
from datetime import date, timedelta
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "data"))

import seed_db  # noqa: E402
from judge import judge_conversation  # noqa: E402
from matcher import check_tool_calls  # noqa: E402

CHAT_URL = "http://localhost:8000/chat"
CASES_PATH = Path(__file__).parent / "cases.csv"
RESULTS_PATH = Path(__file__).parent / "results.csv"


def load_cases() -> list[dict]:
    with open(CASES_PATH, newline="") as f:
        rows = list(csv.DictReader(f))

    cases = []
    for row in rows:
        cases.append({
            "id": row["id"],
            "category": row["category"],
            "turns": row["turns"].split(" || "),
            "ground_truth": {
                "tool_calls": json.loads(row["tool_calls_json"] or "[]"),
                "forbidden_tools": [t for t in row["forbidden_tools"].split(",") if t],
                "expect_no_successful_booking": row["expect_no_successful_booking"].strip().upper() == "TRUE",
                "conversation": row["conversation"],
            },
        })
    return cases


def run_case(case: dict, today_str: str, tomorrow_str: str) -> dict:
    seed_db.build()  # reset data to pristine state before every case

    session_id = str(uuid.uuid4())
    transcript = []
    full_trace = []

    for turn in case["turns"]:
        transcript.append({"role": "user", "content": turn})
        resp = requests.post(
            CHAT_URL, json={"session_id": session_id, "message": turn}, timeout=60
        )
        resp.raise_for_status()
        data = resp.json()
        transcript.append({"role": "assistant", "content": data["reply"]})
        full_trace.extend(data["tool_calls"])

    gt = case["ground_truth"]
    tool_check = check_tool_calls(gt, full_trace, today_str, tomorrow_str)
    judge_result = judge_conversation(transcript, full_trace, gt["conversation"])

    overall_pass = tool_check["pass"] and bool(judge_result.get("pass"))

    return {
        "id": case["id"],
        "category": case["category"],
        "turns": case["turns"],
        "ground_truth": gt,
        "pass": overall_pass,
        "tool_check": tool_check,
        "judge": judge_result,
        "transcript": transcript,
        "tool_trace": full_trace,
    }


def write_results_csv(results: list[dict]):
    with open(RESULTS_PATH, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "id", "category", "pass", "tools_pass", "judge_pass",
            "turns",
            "expected_tool_calls", "expected_forbidden_tools", "expected_no_successful_booking",
            "actual_tool_trace", "tool_check_issues",
            "expected_conversation", "judge_reasoning", "final_reply",
            "transcript_json",
        ], quoting=csv.QUOTE_ALL)
        writer.writeheader()
        for r in results:
            gt = r["ground_truth"]
            final_reply = next(
                (t["content"] for t in reversed(r["transcript"]) if t["role"] == "assistant"), ""
            )
            issues = [d for d in r["tool_check"]["details"] if not d.get("found", True) or "forbidden_violation" in d or "unexpected_successful_booking" in d]
            writer.writerow({
                "id": r["id"],
                "category": r["category"],
                "pass": "PASS" if r["pass"] else "FAIL",
                "tools_pass": "PASS" if r["tool_check"]["pass"] else "FAIL",
                "judge_pass": "PASS" if r["judge"].get("pass") else "FAIL",
                "turns": " || ".join(r["turns"]),
                "expected_tool_calls": json.dumps(gt.get("tool_calls", [])),
                "expected_forbidden_tools": ",".join(gt.get("forbidden_tools", [])),
                "expected_no_successful_booking": "TRUE" if gt.get("expect_no_successful_booking") else "FALSE",
                "actual_tool_trace": json.dumps(r["tool_trace"]),
                "tool_check_issues": json.dumps(issues) if issues else "",
                "expected_conversation": gt["conversation"],
                "judge_reasoning": r["judge"].get("reasoning", ""),
                "final_reply": final_reply,
                "transcript_json": json.dumps(r["transcript"]),
            })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--case-id", help="Run only the case with this id")
    args = parser.parse_args()

    cases = load_cases()
    if args.case_id:
        cases = [c for c in cases if c["id"] == args.case_id]
        if not cases:
            print(f"No case with id {args.case_id!r}")
            sys.exit(1)

    today_str = date.today().isoformat()
    tomorrow_str = (date.today() + timedelta(days=1)).isoformat()

    try:
        requests.get("http://localhost:8000/health", timeout=5).raise_for_status()
    except requests.RequestException:
        print("chat_service isn't reachable at http://localhost:8000 -- start it first:")
        print("  cd chat_service && ../.venv/bin/uvicorn main:app --port 8000")
        sys.exit(1)

    results = []
    for case in cases:
        print(f"Running {case['id']}...", end=" ", flush=True)
        result = run_case(case, today_str, tomorrow_str)
        results.append(result)
        status = "PASS" if result["pass"] else "FAIL"
        tool_status = "ok" if result["tool_check"]["pass"] else "FAIL"
        judge_status = "ok" if result["judge"].get("pass") else "FAIL"
        print(f"{status}  (tools={tool_status}, judge={judge_status})")
        if not result["pass"]:
            if not result["tool_check"]["pass"]:
                print(f"    tool_check details: {result['tool_check']['details']}")
            if not result["judge"].get("pass"):
                print(f"    judge reasoning: {result['judge'].get('reasoning')}")

    passed = sum(1 for r in results if r["pass"])
    print(f"\n{passed}/{len(results)} cases passed.")

    write_results_csv(results)
    print(f"Full results written to {RESULTS_PATH}")

    seed_db.build()  # leave the app in its pristine demo state afterwards

    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
