def clean_json_string(s: str) -> str:
    return s.replace("```json\n", "").replace("\n```", "").replace("```", "").strip()
