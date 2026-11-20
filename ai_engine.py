import os, json, re, httpx

CURRICULUM = {
 "Python": ["Variables & Data Types","Operators","Conditionals","Loops","Functions","Lists & Dicts","Strings","File Handling","OOP"],
 "HTML": ["Structure & Tags","Links & Images","Lists & Tables","Forms","Semantic HTML"],
 "CSS": ["Selectors","Box Model","Flexbox","Grid","Responsive Design"],
 "JavaScript": ["Variables & Types","Functions","Arrays & Objects","DOM Manipulation","Events","Async & Fetch"],
}

def key(): return os.getenv("GEMINI_API_KEY", "").strip()

async def gemini(prompt, system="", history=None, as_json=False):
    if not key(): raise RuntimeError("GEMINI_API_KEY is not set")
    contents = [{"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]} for m in (history or [])]
    contents.append({"role": "user", "parts": [{"text": prompt}]})
    body = {"contents": contents}
    if system: body["systemInstruction"] = {"parts": [{"text": system}]}
    if as_json: body["generationConfig"] = {"responseMimeType": "application/json"}
    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent", params={"key": key()}, json=body)
    except httpx.HTTPError as e:
        raise RuntimeError(f"Could not reach Gemini: {e.__class__.__name__}")
    if r.status_code != 200: raise RuntimeError(f"Gemini returned HTTP {r.status_code}. Check your API key and quota.")
    try: return r.json()["candidates"][0]["content"]["parts"][0]["text"]
    except Exception: raise RuntimeError("Gemini returned an empty response")

def tutor_system(subject, level, language):
    return (f"You are CodeShala AI Mentor, a patient programming teacher from CodeShalaByKMFL. Subject: {subject}. Student level: {level}. "
            f"Reply in {language} (Hinglish = Hindi written in Roman script mixed with English). Use simple words, short code examples in fenced blocks, "
            "and step-by-step explanations. Match depth to the level. End with one quick check question.")

def quiz_prompt(subject, topic, level, n):
    return (f"Create {n} multiple-choice questions on {subject} topic '{topic}' at {level} level. Return ONLY a JSON array of objects: "
            '{"q": str, "options": [4 strings], "answer": index 0-3, "explanation": str}. Exactly one option is correct. Explain why.')

def parse_questions(text):
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    qs = json.loads(text)
    out = [q for q in qs if isinstance(q, dict) and isinstance(q.get("options"), list) and len(q["options"]) >= 2
           and isinstance(q.get("answer"), int) and 0 <= q["answer"] < len(q["options"]) and q.get("q")]
    if not out: raise ValueError("no valid questions")
    return [{"q": q["q"], "options": q["options"], "answer": q["answer"], "explanation": q.get("explanation", "")} for q in out]

DEMO_QS = {
 "Python": [("Which keyword starts a loop over a sequence?", ["for", "if", "def", "class"], 0, "`for` iterates over each item of a sequence."),
            ("What does range(3) produce?", ["1,2,3", "0,1,2", "0,1,2,3", "3"], 1, "range(3) starts at 0 and stops before 3.")],
 "HTML": [("Which tag creates a hyperlink?", ["<a>", "<link>", "<p>", "<img>"], 0, "<a href> makes links."),
          ("Which tag is the largest heading?", ["<h6>", "<head>", "<h1>", "<header>"], 2, "<h1> is the top-level heading.")],
 "CSS": [("Which property changes text colour?", ["font-color", "color", "text-style", "fg"], 1, "`color` sets text colour."),
         ("Which display value enables Flexbox?", ["flex", "block", "grid", "inline"], 0, "`display:flex` makes a flex container.")],
 "JavaScript": [("Which keyword declares a block-scoped variable?", ["var", "let", "dim", "int"], 1, "`let` (and `const`) are block-scoped."),
                ("What does === check?", ["value only", "type only", "value and type", "reference only"], 2, "Strict equality compares value and type.")],
}
def demo_questions(subject):
    return [{"q": q, "options": o, "answer": a, "explanation": e} for q, o, a, e in DEMO_QS[subject]]

def analyse(subject, results, completed):
    """Adaptive engine: derives status, next level and next lessons from real quiz results only."""
    topics, hist = CURRICULUM[subject], {}
    for r in results:
        if r.topic in topics and r.total: hist.setdefault(r.topic, []).append(r.score / r.total)
    status, level, pct = {}, {}, {}
    for t in topics:
        h = hist.get(t, [])[-3:]
        if not h: status[t] = "new"; continue
        p = sum(h) / len(h); pct[t] = round(p * 100)
        status[t] = "weak" if p < .6 else "strong" if p >= .8 else "learning"
        level[t] = {"weak": "Beginner", "learning": "Intermediate", "strong": "Advanced"}[status[t]]
    nxt = [{"topic": t, "reason": f"Scored {pct[t]}% recently. Re-learn it, then take an easier {level[t]} quiz."} for t in sorted((t for t in topics if status[t] == "weak"), key=lambda t: pct[t])]
    nxt += [{"topic": t, "reason": "Not assessed yet. Take a quiz to find your level."} for t in topics if status[t] == "new" and t not in completed]
    nxt += [{"topic": t, "reason": f"At {pct[t]}%. Practice at {level[t]} level to master it."} for t in topics if status[t] == "learning"]
    return {"status": status, "level": level, "percent": pct, "weak": [t for t in topics if status[t] == "weak"], "next": nxt[:4]}
