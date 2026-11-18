---
title: JobPulse AI service
emoji: 🧠
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# JobPulse AI service

Reads CVs (PDF/DOCX) and turns text into embeddings for [JobPulse](https://github.com/Raisul516/jobpulse).
Only the JobPulse backend uses it: set the `AI_SERVICE_TOKEN` secret here and the same value in the backend.

Local run: see the main JobPulse README.
