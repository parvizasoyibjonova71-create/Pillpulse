# PillPulse

Many older people keep their medicine schedule in a paper notebook and sometimes forget to look at it.
PillPulse turns notebook lines into a daily checklist, reminders, a family update and a doctor report.
It also measures resting pulse with the phone camera (photoplethysmography).

## Features
- Type medicines the way you write them in a notebook ("Lisinopril 10 mg at 9am and 9pm"); a rule-based parser turns them into a schedule.
- Big "I took it" buttons, missed-dose detection, 7-day adherence.
- One-tap summary to family via WhatsApp / Telegram / share sheet (no accounts, no bot).
- Daily repeating phone reminders via a downloadable .ics calendar file.
- Camera pulse measurement (red-channel PPG, band-pass + peak detection) with history chart.
- Printable weekly doctor report. Extra-large text and read-aloud for accessibility.
- All data stays in the browser (localStorage). No server.

## Run locally
    python -m http.server 8000
then open http://localhost:8000 (camera works on localhost and on https).

## Built with
HTML, CSS, vanilla JavaScript. No libraries. AI coding assistant (Claude) was used and is disclosed per the hackathon rules.

## Disclaimer
Student project. Not a medical device.
