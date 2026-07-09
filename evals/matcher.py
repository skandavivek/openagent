"""Deterministic checks for a case's expected MCP tool-call sequence.

This is the "component 2" ground truth: an ordered, structured spec of which
tools should have been called with which arguments (and what the tool should
have returned), independent of the conversational LLM-judge check in judge.py.
"""
import json


def resolve_templates(value, today_str: str, tomorrow_str: str):
    if isinstance(value, str):
        if value == "{today}":
            return today_str
        if value == "{tomorrow}":
            return tomorrow_str
        return value
    if isinstance(value, dict):
        return {k: resolve_templates(v, today_str, tomorrow_str) for k, v in value.items()}
    return value


def _values_match(expected, actual) -> bool:
    if isinstance(expected, str) and isinstance(actual, str):
        return expected.strip().lower() == actual.strip().lower()
    return expected == actual


def _call_matches(expected: dict, actual_call: dict, today_str: str, tomorrow_str: str) -> bool:
    if actual_call["tool"] != expected["tool"]:
        return False

    args = actual_call["input"]

    args_exact = resolve_templates(expected.get("args_exact", {}), today_str, tomorrow_str)
    for key, exp_val in args_exact.items():
        if key not in args or not _values_match(exp_val, args[key]):
            return False

    args_contains = expected.get("args_contains", {})
    for key, substr in args_contains.items():
        if key not in args or substr.lower() not in str(args[key]).lower():
            return False

    value_in_args = expected.get("value_in_args", [])
    haystack = json.dumps(args).lower()
    for substr in value_in_args:
        if substr.lower() not in haystack:
            return False

    result_json = expected.get("result_json")
    if result_json is not None:
        try:
            actual_result = json.loads(actual_call["result"])
        except (json.JSONDecodeError, TypeError):
            return False
        for key, exp_val in result_json.items():
            if actual_result.get(key) != exp_val:
                return False

    return True


def check_tool_calls(ground_truth: dict, trace: list, today_str: str, tomorrow_str: str) -> dict:
    """Checks `trace` (list of {tool, input, result}) against ground_truth's
    tool_calls (ordered, each must be found at or after the previous match),
    forbidden_tools (must never appear), and expect_no_successful_booking.
    """
    details = []
    overall_pass = True
    cursor = 0

    for expected in ground_truth.get("tool_calls", []):
        found_at = None
        for i in range(cursor, len(trace)):
            if _call_matches(expected, trace[i], today_str, tomorrow_str):
                found_at = i
                break
        if found_at is None:
            overall_pass = False
            details.append({"expected": expected, "found": False})
        else:
            cursor = found_at + 1
            details.append({"expected": expected, "found": True, "matched_call": trace[found_at]})

    forbidden = ground_truth.get("forbidden_tools", [])
    called_tools = {c["tool"] for c in trace}
    for tool_name in forbidden:
        if tool_name in called_tools:
            overall_pass = False
            details.append({"forbidden_violation": tool_name})

    if ground_truth.get("expect_no_successful_booking"):
        for call in trace:
            if call["tool"] != "create_booking":
                continue
            try:
                result = json.loads(call["result"])
            except (json.JSONDecodeError, TypeError):
                continue
            if result.get("success") is True:
                overall_pass = False
                details.append({"unexpected_successful_booking": call})

    return {"pass": overall_pass, "details": details}
