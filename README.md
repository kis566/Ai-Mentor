# CodeShala AI Mentor

**Your Personal AI Teacher — Learn, Practice & Improve.**  
CodeShalaByKMFL · Hackathon challenge PS04

CodeShala is a personalized programming-learning MVP for Python, HTML, CSS, and JavaScript. Students can chat with a tutor in English, Hindi, or Hinglish; take adaptive quizzes; inspect code with static AI analysis; and follow a roadmap informed by their own quiz scores.

## Features

- **AI tutor:** beginner-friendly, step-by-step answers with conversation context and optional speech input/output.
- **Adaptive quizzes:** topic and difficulty selection, multiple-choice evaluation, and answer explanations.
- **Evidence-based roadmap:** the last three quiz attempts per topic determine status and suggested difficulty. Under 60% is flagged for review, 60–79% is building confidence, and 80% or higher is strong.
- **Code clinic:** static explanation and debugging for Python, HTML, CSS, and JavaScript. Submitted code is never executed.
- **Progress analytics:** scores, accuracy trends, topic history, and lessons the student marks complete.
- **Appearance:** persistent light and dark themes with palette-aware cards, controls, code panels, and charts.
- **Local-first profile:** name, preferences, chat, completions, and quiz attempts are stored in browser LocalStorage.
- **Transparent fallback:** without a working Gemini connection, the app labels sample quiz content and demo tutor responses. A submitted demo quiz still records the student's actual answers; no sample score is preloaded.
- **Demo quiz scope:** every curriculum topic has three curated starter questions. In demo mode they are beginner-level; AI-generated quizzes use the selected difficulty when Gemini is available.

## Project structure

```text
CodeShala-AI-Mentor/
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── backend/
│   ├── main.py
│   ├── ai_engine.py
│   ├── requirements.txt
│   └── .env.example
├── .gitignore
├── README.md
└── PRESENTATION.md
```

## Install and run

Requirements: Python 3.10+ and pip. No frontend build step or npm packages are required.

**Windows PowerShell**

```powershell
cd CodeShala-AI-Mentor
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
uvicorn backend.main:app --reload --port 8000
```

**macOS / Linux**

```bash
cd CodeShala-AI-Mentor
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env
uvicorn backend.main:app --reload --port 8000
```

Open **http://localhost:8000**. FastAPI serves the frontend and API from the same origin. The interactive API reference is at **http://localhost:8000/docs**.

## Configure Gemini

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Put it in `backend/.env` as `GEMINI_API_KEY=...` (replace the example value).
3. Keep `backend/.env` private; it is ignored by Git. The key is read only by Python and is never sent to the browser.
4. Restart the backend. `/api/health` reports whether a key is configured; each AI response separately indicates live or demo output.

You can optionally change `GEMINI_MODEL` in `backend/.env`. Without a valid key or when Gemini is unreachable, tutor and code responses are labeled as demo/unavailable, and quizzes use labeled, topic-matched curated sample questions.

## Test the adaptive cycle

1. Open the dashboard and select Python.
2. Go to **Practice quiz**, choose **Loops**, and submit all answers. With no key, the app identifies the questions as demo samples; your submitted answers are still real performance data.
3. Repeat the quiz with a low score. The last-three-attempt average is used; below 60% marks Loops as needing review and suggests a Beginner retry.
4. Score 60–79% to see “building confidence” and an Intermediate suggestion; average 80% or above to see “strong” and Advanced practice.
5. Visit **Progress** to see actual attempts and **Learning path** to mark lessons complete.

No progress is fabricated or seeded. The LocalStorage profile is per browser and device; clearing browser site data removes it.

## API

- `GET /api/health` — backend status and Gemini-key configuration state
- `GET /api/curriculum` — supported subjects and topics
- `POST /api/chat` — contextual tutor response
- `POST /api/quiz/generate` — AI or clearly labeled sample quiz
- `POST /api/quiz/evaluate` — score and per-question explanations
- `POST /api/code/explain` — static code explanation and debugging
- `POST /api/learning/recommend` — score-based topic status and next steps

The API validates subject, level, language, payload sizes, quiz bounds, and answer indexes. Gemini failures return clear errors; the UI labels fallback/demo content and never says that code was executed.

## Design and implementation notes

Vanilla HTML/CSS/JavaScript, FastAPI, Pydantic, httpx, Gemini API, and browser LocalStorage. The frontend is responsive and served by the Python backend. Recommendations are deterministic rules over real submitted attempts: recent accuracy uses at most the last three scores per topic; it is not generated randomly by the language model.
