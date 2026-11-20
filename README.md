# URC · DNM appointments

Every hour, reads DNM's public Residencia Legal calendar for each office and saves the next three open appointments to `data/appointments.json`.

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
