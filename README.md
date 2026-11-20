# URC · DNM appointments

Every hour, reads DNM's public Residencia Legal calendar for each office and saves the next three open appointments to `docs/data/appointments.json`. The app in `docs/` shows them grouped by month, soonest first.

Offices covered: Montevideo (residencia definitiva only) and every office in the interior. The list lives in `scraper/offices.json`; each `id` is the office number DNM's own calendar page uses.

## Running it

- **Automatically:** the "Update appointments" workflow runs at minute 17 of every hour.
- **By hand:** Actions → Update appointments → Run workflow.
- **Locally:**
  ```bash
  pip install -r requirements.txt
  python scraper/fetch.py
  python -m pytest tests
  ```

## What each office gets

- `status`: `open` (has slots), `full` (calendar shows nothing), or `error` (the page didn't load)
- `slots`: up to three, each with `date`, `time` and DNM's original `label`
- `url`: the office's calendar on DNM

DNM's page doesn't show the year, so a date earlier than today is read as next year.

## The app

`docs/` is a small installable web app (DNM Schedule), served by GitHub Pages from the `main` branch, `/docs` folder.

- Open it on your phone and use **Add to Home screen** to install it.
- Pill colors: purple = within 30 days, pink = within 60, pale pink = later.
- Tap an office for its address, the next three slots and a link to its DNM calendar.

Fonts: Bogart (trial files, digits replaced by Bricolage Grotesque because the trial blanks them out) and Inter.
