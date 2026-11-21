# CodeShala AI Mentor | PS04
## Your Personal AI Teacher
**Learn. Practice. Improve.** · CodeShalaByKMFL

### 30-second judge pitch
CodeShala is a browser-only programming-learning demo that changes what a learner should study next based on submitted quiz results. Students choose Python, HTML, CSS, or JavaScript, use a local multilingual tutor, take a topic quiz, and get an updated learning path. The whole demo runs from HTML, CSS, and JavaScript with no backend, account, API key, or network connection.

### Problem
Most beginner programming resources deliver the same material to every learner. Students often do not know which concepts they misunderstand, receive little targeted practice, and may not feel comfortable learning only in English.

### Proposed solution
CodeShala AI Mentor combines a conversational programming tutor, topic-based quizzes, code explanations, and a personal learning path. It supports Python, HTML, CSS, and JavaScript, with tutor responses in English, Hindi, or Hinglish.

### Key innovations
- A real adaptive cycle: assessment → teaching → quiz → performance analysis → weak-topic detection → updated roadmap.
- Recommendations come from actual quiz answers, not randomized sample progress or AI guesses.
- Difficulty adapts per topic using recent evidence: below 60% suggests Beginner review; 60–79% suggests Intermediate practice; 80% or higher suggests Advanced challenge.
- Offline mode remains honest: tutor and code-clinic responses use local demo logic, and submitted quiz answers—not sample scores—power the learner's roadmap.
- Code review is static analysis. The platform never claims to execute submitted code.

### System architecture
```text
Learner browser
  ├─ Responsive HTML/CSS/Vanilla JS
  ├─ Local mentor, quiz evaluation, and recommendation rules
  └─ LocalStorage: profile, chat, completions, quiz attempts
```

### Technology stack
- Frontend: HTML5, CSS3, Vanilla JavaScript
- Runtime: browser only; no build tools or server required
- Storage: browser LocalStorage for this MVP

### How personalization works
For each topic, the local recommendation logic takes up to the three latest submitted quiz scores and calculates accuracy. It assigns a status (needs review, building confidence, or strong), chooses a suggested practice difficulty, and prioritizes low-scoring or not-yet-assessed topics. A quiz attempt is only added after the student submits answers. No synthetic scores are seeded.

### Three-minute demo walkthrough
1. Set a learner name and choose Python. Show the empty dashboard: no scores and no weak topics are invented.
2. Ask the offline tutor in Hinglish to explain loops. Point out that the response is local demo logic, not live AI.
3. Open a Loops quiz and submit answers. Explain that the questions are local practice samples while the answers are the learner's own.
4. Submit another low-scoring attempt. Return to the learning path and show Loops flagged for review with a Beginner suggestion.
5. Try a stronger score and show how the recent-attempt average can change the status and difficulty.
6. Open Progress to show the real attempt history, then paste a snippet into Code Clinic and note that it is reviewed but not executed.

### Future scope
Accounts and cloud-synced progress; spaced repetition; teacher and cohort insights; carefully sandboxed code execution with explicit consent; richer diagnostic question banks; additional programming languages and accessibility options.
