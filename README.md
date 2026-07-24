# SFGE Schedule Layout Demo

### https://rm-0454.github.io/SFGE-26-Schedule-Demo-Site/


NOTE: This was build as a short-term demo for the 2026 SFGE, this repo will likely break soon after the convention closes

## Why this demo exists

I am a tech-savvy first-timer at Southern-Fried Gaming Expo (SFGE). I built this demo to show what I believe is a more usable schedule experience than the current layout at https://tabletop.gameatl.com/account/convention-events.php. 

This project is a lightweight, mobile-friendly schedule viewer that presents SFGE events as:

- A grouped timeline view (day -> time -> event cards)
- A horizontal calendar view with overlap handling for concurrent events
- Filters for day, type, room, and text search

The goal is to make planning easier for attendees, especially new attendees who are not yet familiar with room flow, event density, or timing conflicts.


## Improvements

The changes I am proposing largely center around how information is presented to the user. I found scheduling with the current layout to be difficult.

### Card View

The current website is a table of events ordered chronologically. In this demo, each event is presented as a card, which creates clearer visual separation and makes the schedule easier to scan. Organizing the cards by day and start time helps attendees quickly understand their options.

- Events are grouped by day and start time instead of blending into a long list
- Filters stay aligned with the planning task: day, type, room, and search

### Calendar View
In addition to the card view, users can toggle a horizontal calendar view.

- The calendar view makes overlaps and conflicts obvious 
- Filters are unified between calendar and card view


### Future Ideas

There are some additional features I can't adequately showcase in this lightweight demo. 

### My Calendar
I would like to add a vertical calendar view to the "My Schedule" Section that includes all the events I have signed up for AND those I have "Favorited". As far as I can tell the Favorite button doesn't do anything.

### Click to Expand
Right now I don't think the extra information for each RPG game is very salient. Its hiding under the Information/Tool Tip Icon. What I would prefer is that clicking on a card expanded to show you the full event details

### Library View
I haven't spend a lot of time in this section. The library does use a card layout (which I like) but I do have some UI suggestions here as well. 


## Outstanding Issues

This demo **does not** solve what I see as the largest problem in the current SFGE schedule. The separation between tabletop and RPG events from the rest of SFGE programming (video games, speakers, games, music, etc). In fact, it could be argued that putting more effort into the Tabletop/RPG side of the schedule is a step away from unifying the schedule.

The divided schedule creates problems for:

- Discovery: general SFGE attendees may never discover tabletop/RPG events if they only use the main schedule in Yapp.
- Planning: tabletop/RPG attendees cannot easily see cross-program conflicts when the rest of SFGE is on a separate schedule.

In practice, people can miss events or double-book themselves because they are planning from partial data sources. To address this fully, SFGE would need a unified event feed or a merged aggregation layer that combines GameATL schedule data with the rest of SFGE programming in one timeline.


## Current repo scope

This repository currently includes:

- A Python scraper and normalizer for schedule data
- A static frontend with timeline and calendar views
- Filter controls and seat availability indicators
- Static-host friendly deployment pattern


## Project intent

This demo site is intended to communicate my vision for the UX of the event schedule page. It is not intended to be a drop in solution that can be patched into the existing system. I made naive assumptions when recreating the data structures. It is designed to help the SFGE web team evaluate whether a more visual schedule layout could improve future user experiences at conventions.
