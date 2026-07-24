const state = {
	allEvents: [],
	filteredEvents: [],
	viewMode: "timeline",
	filters: {
		day: "all",
		type: "all",
		room: "all",
		query: "",
		hideFull: false,
	},
};

const dayFilterEl = document.getElementById("day-filter");
const typeFilterEl = document.getElementById("type-filter");
const roomFilterEl = document.getElementById("room-filter");
const searchFilterEl = document.getElementById("search-filter");
const hideFullEl = document.getElementById("hide-full");
const scheduleBoardEl = document.getElementById("schedule-board");
const resultsLabelEl = document.getElementById("results-label");
const lastUpdatedEl = document.getElementById("last-updated");
const viewTitleEl = document.getElementById("view-title");
const viewButtons = document.querySelectorAll(".view-btn");
const cardTemplate = document.getElementById("event-card-template");
const DAY_ORDER = ["Fri", "Sat", "Sun"];
const GAMEATL_EVENTS_URL = "https://tabletop.gameatl.com/account/convention-events.php";
let toastTimerId = null;

init();

async function init() {
	bindControlEvents();
	await loadSchedule();
}

function bindControlEvents() {
	dayFilterEl.addEventListener("change", () => {
		state.filters.day = dayFilterEl.value;
		applyFiltersAndRender();
	});

	typeFilterEl.addEventListener("change", () => {
		state.filters.type = typeFilterEl.value;
		applyFiltersAndRender();
	});

	roomFilterEl.addEventListener("change", () => {
		state.filters.room = roomFilterEl.value;
		applyFiltersAndRender();
	});

	searchFilterEl.addEventListener("input", () => {
		state.filters.query = searchFilterEl.value.trim().toLowerCase();
		applyFiltersAndRender();
	});

	hideFullEl.addEventListener("change", () => {
		state.filters.hideFull = hideFullEl.checked;
		applyFiltersAndRender();
	});

	viewButtons.forEach((button) => {
		button.addEventListener("click", () => {
			state.viewMode = button.dataset.view || "timeline";
			updateViewToggle();
			renderScheduleView(state.filteredEvents);
		});
	});

	window.addEventListener("resize", () => {
		syncCalendarViewportHeight();
	});
}

async function loadSchedule() {
	try {
		const response = await fetch("schedule.json", { cache: "no-store" });
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const rawEvents = await response.json();
		state.allEvents = rawEvents.map((event) => normalizeEvent(event));

		populateFilterOptions();
		applyFiltersAndRender();

		lastUpdatedEl.textContent = "";
	} catch (error) {
		scheduleBoardEl.innerHTML = "";
		const errorState = document.createElement("p");
		errorState.className = "empty-state";
		errorState.textContent = `Could not load schedule JSON: ${error.message}`;
		scheduleBoardEl.append(errorState);
		lastUpdatedEl.textContent = "Load failed.";
	}
}

function normalizeEvent(event) {
	const startMinutes = parseStartMinutes(event["Start Time"] || "");
	const durationHours = parseDurationHours(event.Duration || "0 hrs");
	const seatLimit = Number(event["Seat Limit"]) || 0;
	const available = Number(event["Available Seats"]);
	const availableSeats = Number.isFinite(available) ? available : 0;
	const room = getEventRoom(event);
	const area = getEventArea(event);

	return {
		...event,
		Room: room,
		Area: area,
		startMinutes,
		durationHours,
		durationMinutes: Math.max(30, Math.round(durationHours * 60) || 0),
		endMinutes: startMinutes + Math.max(30, Math.round(durationHours * 60) || 0),
		seatLimit,
		availableSeats,
		fillRate: seatLimit > 0 ? 1 - availableSeats / seatLimit : 0,
	};
}

function populateFilterOptions() {
	const uniqueDays = uniqueSortedValues(state.allEvents, (event) => event.Day);
	const uniqueTypes = uniqueSortedValues(state.allEvents, (event) => event["Event Type"]);
	const uniqueRooms = uniqueSortedValues(state.allEvents, (event) => getEventRoom(event));

	fillSelect(dayFilterEl, uniqueDays, "All days");
	fillSelect(typeFilterEl, uniqueTypes, "All types");
	fillSelect(roomFilterEl, uniqueRooms, "All rooms");
}

function fillSelect(selectEl, values, allLabel) {
	selectEl.innerHTML = "";

	const allOption = document.createElement("option");
	allOption.value = "all";
	allOption.textContent = allLabel;
	selectEl.append(allOption);

	values.forEach((value) => {
		const option = document.createElement("option");
		option.value = value;
		option.textContent = value;
		selectEl.append(option);
	});
}

function applyFiltersAndRender() {
	const { day, type, room, query, hideFull } = state.filters;

	state.filteredEvents = state.allEvents
		.filter((event) => (day === "all" ? true : event.Day === day))
		.filter((event) => (type === "all" ? true : event["Event Type"] === type))
		.filter((event) => (room === "all" ? true : getEventRoom(event) === room))
		.filter((event) => {
			if (!query) {
				return true;
			}

			const searchableText = [
				event.Name,
				event["Game System"],
				event.Host,
				getEventRoom(event),
				getEventArea(event),
			]
				.join(" ")
				.toLowerCase();

			return searchableText.includes(query);
		})
		.filter((event) => (hideFull ? event.availableSeats > 0 : true))
		.sort((left, right) => {
			const dayOrderDiff = compareDayOrder(left.Day, right.Day);
			if (dayOrderDiff !== 0) {
				return dayOrderDiff;
			}

			if (left.startMinutes !== right.startMinutes) {
				return left.startMinutes - right.startMinutes;
			}

			if (left.Room !== right.Room) {
				return getEventRoom(left).localeCompare(getEventRoom(right));
			}

			return getEventArea(left).localeCompare(getEventArea(right));
		});

	renderScheduleView(state.filteredEvents);
}

function renderScheduleView(events) {
	updateViewToggle();
	if (state.viewMode === "calendar") {
		renderCalendar(events);
		return;
	}

	renderTimeline(events);
}

function updateViewToggle() {
	viewTitleEl.textContent = "View";

	viewButtons.forEach((button) => {
		const isActive = button.dataset.view === state.viewMode;
		button.classList.toggle("active", isActive);
		button.setAttribute("aria-selected", String(isActive));
	});
}

function renderTimeline(events) {
	scheduleBoardEl.classList.remove("calendar-mode");
	scheduleBoardEl.style.removeProperty("--calendar-max-height");
	scheduleBoardEl.innerHTML = "";
	resultsLabelEl.textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;

	if (!events.length) {
		const empty = document.createElement("p");
		empty.className = "empty-state";
		empty.textContent = "No events match your filters.";
		scheduleBoardEl.append(empty);
		return;
	}

	const groupedByDay = groupBy(events, (event) => event.Day || "Unknown");
	const dayKeys = [...groupedByDay.keys()].sort(compareDayOrder);

	dayKeys.forEach((dayKey) => {
		const daySection = document.createElement("section");
		daySection.className = "day-section";

		const dayHeading = document.createElement("h3");
		dayHeading.className = "day-heading";
		dayHeading.textContent = dayKey;
		daySection.append(dayHeading);

		const groupedByTime = groupBy(groupedByDay.get(dayKey), (event) => event.startMinutes);
		const timeKeys = [...groupedByTime.keys()].sort((left, right) => left - right);

		timeKeys.forEach((timeKey) => {
			const row = document.createElement("section");
			row.className = "time-row";

			const timeLabel = document.createElement("div");
			timeLabel.className = "time-label";
			timeLabel.textContent = toTimeLabel(timeKey);

			const lane = document.createElement("div");
			lane.className = "event-lane";

			groupedByTime.get(timeKey).forEach((event) => lane.append(renderEventCard(event)));

			row.append(timeLabel, lane);
			daySection.append(row);
		});

		scheduleBoardEl.append(daySection);
	});
}

function renderCalendar(events) {
	scheduleBoardEl.classList.add("calendar-mode");
	scheduleBoardEl.innerHTML = "";
	resultsLabelEl.textContent = `${events.length} event${events.length === 1 ? "" : "s"}`;

	if (!events.length) {
		const empty = document.createElement("p");
		empty.className = "empty-state";
		empty.textContent = "No events match your filters.";
		scheduleBoardEl.append(empty);
		return;
	}

	const validTimedEvents = events.filter(
		(event) => Number.isFinite(event.startMinutes) && event.startMinutes !== Number.MAX_SAFE_INTEGER,
	);

	if (!validTimedEvents.length) {
		const empty = document.createElement("p");
		empty.className = "empty-state";
		empty.textContent = "No timed events available for calendar layout.";
		scheduleBoardEl.append(empty);
		return;
	}

	const minStart = Math.min(...validTimedEvents.map((event) => event.startMinutes));
	const maxEnd = Math.max(...validTimedEvents.map((event) => event.endMinutes));
	const startHour = Math.floor(minStart / 60);
	const lastRequiredHour = 25; // 1:00am next day
	const endHour = Math.max(startHour + 1, Math.ceil(maxEnd / 60), lastRequiredHour);
	const pixelsPerHour = 180;
	const pixelsPerMinute = pixelsPerHour / 60;
	const rangeMinutes = (endHour - startHour) * 60;
	const leftAxisInset = 0;
	const rightAxisInset = 0;
	const trackWidth = rangeMinutes * pixelsPerMinute + leftAxisInset + rightAxisInset;
	const laneHeight = 66;
	const trackPadding = 6;

	const groupedByDay = groupBy(validTimedEvents, (event) => event.Day || "Unknown");
	const dayKeys = [...groupedByDay.keys()].sort(compareDayOrder);

	const calendar = document.createElement("div");
	calendar.className = "calendar-horizontal";

	const axisRow = document.createElement("section");
	axisRow.className = "calendar-axis-row";

	const axisDayCell = document.createElement("div");
	axisDayCell.className = "calendar-day-cell axis";
	axisDayCell.textContent = "Day";

	const axisTrack = document.createElement("div");
	axisTrack.className = "calendar-axis-track";
	axisTrack.style.width = `${trackWidth}px`;

	for (let hour = startHour; hour <= endHour; hour += 1) {
		const marker = document.createElement("div");
		marker.className = "calendar-axis-marker";
		marker.style.left = `${leftAxisInset + (hour - startHour) * 60 * pixelsPerMinute}px`;

		if (hour === startHour) {
			marker.classList.add("edge-start");
		} else if (hour === endHour) {
			marker.classList.add("edge-end");
		}

		marker.textContent = toTimeLabel(hour * 60);
		axisTrack.append(marker);
	}

	axisRow.append(axisDayCell, axisTrack);
	calendar.append(axisRow);

	dayKeys.forEach((dayKey) => {
		const dayEvents = groupedByDay.get(dayKey) || [];
		const layoutEvents = computeOverlapLayout(dayEvents);
		const laneCount = Math.max(1, ...layoutEvents.map((event) => event.lane + 1));
		const trackHeight = laneCount * laneHeight + trackPadding * 2;

		const row = document.createElement("section");
		row.className = "calendar-day-row";

		const dayCell = document.createElement("div");
		dayCell.className = "calendar-day-cell";
		dayCell.textContent = dayKey;

		const track = document.createElement("div");
		track.className = "calendar-day-track";
		track.style.width = `${trackWidth}px`;
		track.style.height = `${trackHeight}px`;

		for (let hour = startHour; hour <= endHour; hour += 1) {
			const line = document.createElement("div");
			line.className = "calendar-vertical-line";
			line.style.left = `${leftAxisInset + (hour - startHour) * 60 * pixelsPerMinute}px`;
			track.append(line);
		}

		layoutEvents.forEach((event) => {
			track.append(
				renderCalendarBlock(event, startHour * 60, pixelsPerMinute, laneHeight, trackPadding, leftAxisInset),
			);
		});

		row.append(dayCell, track);
		calendar.append(row);
	});

	scheduleBoardEl.append(calendar);
	syncCalendarViewportHeight();
	requestAnimationFrame(() => {
		syncCalendarViewportHeight();
	});
}

function syncCalendarViewportHeight() {
	if (state.viewMode !== "calendar" || !scheduleBoardEl.classList.contains("calendar-mode")) {
		scheduleBoardEl.style.removeProperty("--calendar-max-height");
		return;
	}

	const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
	const boardTop = scheduleBoardEl.getBoundingClientRect().top;
	const viewportBottomGap = 16;
	const maxHeight = Math.max(280, Math.floor(viewportHeight - boardTop - viewportBottomGap));

	scheduleBoardEl.style.setProperty("--calendar-max-height", `${maxHeight}px`);
}

function renderCalendarBlock(event, baseMinutes, pixelsPerMinute, laneHeight, trackPadding, leftAxisInset) {
	const block = document.createElement("a");
	block.className = "calendar-event";
	const eventType = String(event["Event Type"] || "").toLowerCase();
	if (eventType === "tabletop") {
		block.classList.add("calendar-event-tabletop");
	} else if (eventType === "rpg") {
		block.classList.add("calendar-event-rpg");
	}
	block.href = buildGameAtlSearchUrl(event.Name);
	block.setAttribute("aria-label", `Open GameATL schedule search for ${event.Name}`);
	attachClipboardAssist(block, event.Name);

	const left = leftAxisInset + (event.startMinutes - baseMinutes) * pixelsPerMinute;
	const width = Math.max(94, event.durationMinutes * pixelsPerMinute - 4);
	const top = event.lane * laneHeight + trackPadding;
	const height = laneHeight - 8;

	block.style.left = `${left}px`;
	block.style.width = `${width}px`;
	block.style.top = `${top}px`;
	block.style.height = `${height}px`;

	block.innerHTML = [
		`<h4 class="calendar-event-name">${escapeHtml(event.Name)}</h4>`,
		`<p class="calendar-event-meta">${escapeHtml(event["Event Type"])} | ${escapeHtml(event["Start Time"])} | ${escapeHtml(event.Duration)}</p>`,
		`<p class="calendar-event-meta">${escapeHtml(getEventRoom(event))} | ${escapeHtml(getEventArea(event))}</p>`,
	].join("");

	return block;
}

function computeOverlapLayout(dayEvents) {
	const events = [...dayEvents]
		.sort((left, right) => {
			if (left.startMinutes !== right.startMinutes) {
				return left.startMinutes - right.startMinutes;
			}
			return left.endMinutes - right.endMinutes;
		})
		.map((event) => ({ ...event, lane: 0, laneCount: 1 }));

	const active = [];
	let cluster = [];
	let clusterEnd = -1;
	let clusterLaneCount = 1;

	const flushCluster = () => {
		cluster.forEach((event) => {
			event.laneCount = clusterLaneCount;
		});
		cluster = [];
		clusterEnd = -1;
		clusterLaneCount = 1;
	};

	events.forEach((event) => {
		for (let index = active.length - 1; index >= 0; index -= 1) {
			if (active[index].endMinutes <= event.startMinutes) {
				active.splice(index, 1);
			}
		}

		if (cluster.length && event.startMinutes >= clusterEnd) {
			flushCluster();
		}

		const usedLanes = new Set(active.map((item) => item.lane));
		let lane = 0;
		while (usedLanes.has(lane)) {
			lane += 1;
		}

		event.lane = lane;
		active.push(event);
		cluster.push(event);
		clusterEnd = Math.max(clusterEnd, event.endMinutes);
		clusterLaneCount = Math.max(clusterLaneCount, lane + 1);
	});

	if (cluster.length) {
		flushCluster();
	}

	return events;
}

function renderEventCard(event) {
	const clone = cardTemplate.content.firstElementChild.cloneNode(true);
	clone.style.setProperty("--accent-h", String(colorHueFromText(event["Game System"] || event.Name)));
	const eventType = String(event["Event Type"] || "").toLowerCase();
	const systemLabel = normalizeSystem(event["Game System"]);

	if (eventType === "tabletop") {
		clone.classList.add("event-card-tabletop");
	} else if (eventType === "rpg") {
		clone.classList.add("event-card-rpg");
	}

	clone.querySelector(".event-name").textContent = event.Name;
	clone.querySelector(".event-system").textContent = systemLabel || event["Event Type"] || "System TBA";
	clone.querySelector(".event-meta").textContent = `${event["Event Type"]} | ${event.Duration} | Host: ${event.Host}`;
	clone.querySelector(".event-location").textContent = `${getEventRoom(event)} | ${getEventArea(event)}`;

	const seatPill = clone.querySelector(".seat-pill");
	seatPill.textContent = `${event.availableSeats}/${event.seatLimit} open`;

	if (event.availableSeats <= 0) {
		seatPill.classList.add("danger");
	} else if (event.fillRate >= 0.75) {
		seatPill.classList.add("warn");
	} else {
		seatPill.classList.add("ok");
	}

	const link = document.createElement("a");
	link.className = "event-link";
	link.href = buildGameAtlSearchUrl(event.Name);
	link.setAttribute("aria-label", `Open GameATL schedule search for ${event.Name}`);
	attachClipboardAssist(link, event.Name);
	link.append(clone);

	return link;
}

function parseStartMinutes(text) {
	const normalized = String(text || "").trim().toLowerCase();
	const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);

	if (!match) {
		return Number.MAX_SAFE_INTEGER;
	}

	let hour = Number(match[1]) % 12;
	const minute = Number(match[2] || "0");
	const meridian = match[3].toLowerCase();

	if (meridian === "pm") {
		hour += 12;
	}

	return hour * 60 + minute;
}

function parseDurationHours(text) {
	const match = String(text || "").match(/(\d+(?:\.\d+)?)\s*hrs?/i);
	return match ? Number(match[1]) : 0;
}

function toTimeLabel(minutes) {
	if (!Number.isFinite(minutes) || minutes === Number.MAX_SAFE_INTEGER) {
		return "TBD";
	}

	const hour24Raw = Math.floor(minutes / 60);
	const hour24 = ((hour24Raw % 24) + 24) % 24;
	const minute = minutes % 60;
	const meridian = hour24 >= 12 ? "pm" : "am";
	const hour12 = hour24 % 12 || 12;
	return `${hour12}:${String(minute).padStart(2, "0")}${meridian}`;
}

function uniqueSortedValues(items, selector) {
	const values = new Set(items.map(selector).filter(Boolean));
	return [...values].sort((left, right) => left.localeCompare(right));
}

function groupBy(items, keySelector) {
	const map = new Map();
	items.forEach((item) => {
		const key = keySelector(item);
		const group = map.get(key);

		if (group) {
			group.push(item);
		} else {
			map.set(key, [item]);
		}
	});

	return map;
}

function colorHueFromText(text) {
	const value = String(text || "");
	let hash = 0;
	for (let index = 0; index < value.length; index += 1) {
		hash = (hash << 5) - hash + value.charCodeAt(index);
		hash |= 0;
	}
	return Math.abs(hash) % 360;
}

function compareDayOrder(leftDay, rightDay) {
	const leftIndex = DAY_ORDER.indexOf(leftDay);
	const rightIndex = DAY_ORDER.indexOf(rightDay);

	const safeLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
	const safeRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

	if (safeLeftIndex !== safeRightIndex) {
		return safeLeftIndex - safeRightIndex;
	}

	return String(leftDay || "").localeCompare(String(rightDay || ""));
}

function escapeHtml(value) {
	return String(value || "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function normalizeSystem(value) {
	const system = String(value || "").trim();
	if (!system) {
		return "";
	}

	const folded = system.toLowerCase();
	if (folded === "na" || folded === "n/a") {
		return "";
	}

	return system;
}

function getEventRoom(event) {
	const room = String(event?.Room || "").trim();
	if (room) {
		return room;
	}

	return "TBD";
}

function getEventArea(event) {
	const area = String(event?.Area || "").trim();
	if (area) {
		return area;
	}

	const legacyLocation = String(event?.Location || "").trim();
	if (legacyLocation) {
		return legacyLocation;
	}

	const room = String(event?.Room || "").trim();
	const legacyTable = String(event?.Table || "").trim();
	if (legacyTable && legacyTable.toLowerCase() !== "tbd") {
		return legacyTable;
	}

	return room || "TBD";
}

function buildGameAtlSearchUrl(eventTitle) {
	return GAMEATL_EVENTS_URL;
}

function attachClipboardAssist(linkEl, eventTitle) {
	linkEl.addEventListener("click", async (event) => {
		if (shouldBypassIntercept(event, linkEl)) {
			return;
		}

		event.preventDefault();

		const searchText = String(eventTitle || "").trim();
		let copied = false;

		if (searchText && navigator.clipboard && navigator.clipboard.writeText) {
			try {
				await navigator.clipboard.writeText(searchText);
				copied = true;
			} catch {
				copied = false;
			}
		}

		showCopyToast(copied, searchText);
		window.setTimeout(() => {
			window.location.href = linkEl.href;
		}, 180);
	});
}

function shouldBypassIntercept(event, linkEl) {
	return (
		event.defaultPrevented
		|| event.button !== 0
		|| event.metaKey
		|| event.ctrlKey
		|| event.shiftKey
		|| event.altKey
		|| linkEl.target === "_blank"
	);
}

function showCopyToast(copied, searchText) {
	const toast = ensureCopyToastElement();
	toast.textContent = copied
		? `Copied title: ${searchText}`
		: "Opening GameATL schedule...";
	toast.classList.add("show");

	if (toastTimerId) {
		window.clearTimeout(toastTimerId);
	}

	toastTimerId = window.setTimeout(() => {
		toast.classList.remove("show");
		toastTimerId = null;
	}, 1400);
}

function ensureCopyToastElement() {
	let toast = document.getElementById("copy-toast");
	if (toast) {
		return toast;
	}

	toast = document.createElement("div");
	toast.id = "copy-toast";
	toast.className = "copy-toast";
	toast.setAttribute("role", "status");
	toast.setAttribute("aria-live", "polite");
	document.body.append(toast);
	return toast;
}
