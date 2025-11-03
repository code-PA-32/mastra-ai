import { createTool } from "@mastra/core/tools"
import fs from "fs/promises"
import path from "path"
import { z } from "zod"

const eventSchema = z.object({
  type: z.string(),
  title: z.string(),
  from: z.string(),
  to: z.string(),
  location: z.string().optional(),
  participants: z.array(z.string()).optional(),
})

export const workdaySchema = z.object({
  date: z.string(),
  workday: z.object({
    events: z.array(eventSchema),
  }),
})

type WorkdayData = z.infer<typeof workdaySchema>
type Event = z.infer<typeof eventSchema>

export const getDayEvents = createTool({
  id: "get-events",
  description: "Get detailed information about day events from JSON files. Always requires a date.",
  inputSchema: z.object({
    date: z.string().describe("Date to get events for in YYYY-MM-DD format (e.g., '2025-10-28')"),
  }),
  outputSchema: z.union([
    z.array(eventSchema),
    z.object({
      success: z.literal(false),
      message: z.string(),
    }),
  ]),
  execute: async ({ context }) => {
    const eventsDir = path.join(process.cwd(), "data")

    try {
      const targetDate = context.date
      const targetFile = `${targetDate}.json`
      const filePath = path.join(eventsDir, targetFile)

      // Check if file exists
      try {
        await fs.access(filePath)
      } catch {
        return {
          success: false as const,
          message: `No events found for date ${targetDate}. Please check if the date is correct.`,
        }
      }

      const content = await fs.readFile(filePath, "utf-8")
      const data = JSON.parse(content) as WorkdayData

      if (!data.workday.events || data.workday.events.length === 0) {
        return {
          success: false as const,
          message: `No events scheduled for ${targetDate}`,
        }
      }

      return data.workday.events
    } catch (error) {
      if (error instanceof Error) {
        return {
          success: false as const,
          message: `Failed to read events: ${error.message}`,
        }
      }
      return {
        success: false as const,
        message: "Failed to read events: Unknown error",
      }
    }
  },
})

const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

const isTimeInEvent = (time: string, event: Event): boolean => {
  const timeMinutes = timeToMinutes(time)
  const fromMinutes = timeToMinutes(event.from)
  const toMinutes = timeToMinutes(event.to)

  return timeMinutes >= fromMinutes && timeMinutes < toMinutes
}

export const getEvent = createTool({
  id: "get-event",
  description: "Get a specific event based on a given time. Finds the event that is happening at the specified time.",
  inputSchema: z.object({
    time: z.string().describe("Time in HH:MM format (e.g., '09:15', '14:30')"),
    date: z.string().describe("Date to search in YYYY-MM-DD format (e.g., '2025-10-28')"),
  }),
  outputSchema: z.union([
    eventSchema,
    z.object({
      found: z.literal(false),
      message: z.string(),
    }),
  ]),

  execute: async ({ context }) => {
    const { time, date } = context

    // Validate time format
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    if (!timeRegex.test(time)) {
      return {
        found: false as const,
        message: "Invalid time format. Please use HH:MM format (e.g., '09:15' or '14:30')",
      }
    }

    const eventsDir = path.join(process.cwd(), "data")

    try {
      const targetFile = `${date}.json`
      const filePath = path.join(eventsDir, targetFile)

      // Check if file exists
      try {
        await fs.access(filePath)
      } catch {
        return {
          found: false as const,
          message: `No event data found for ${date}`,
        }
      }

      const content = await fs.readFile(filePath, "utf-8")
      const data = JSON.parse(content) as WorkdayData

      const event = data.workday.events.find(evt => isTimeInEvent(time, evt))

      if (event) {
        return event
      }

      // Find nearest events for better user experience
      const sortedEvents = data.workday.events.sort((a, b) =>
        timeToMinutes(a.from) - timeToMinutes(b.from)
      )

      const nearestEvent = sortedEvents.find(evt =>
        timeToMinutes(evt.from) > timeToMinutes(time)
      )

      if (nearestEvent) {
        return {
          found: false as const,
          message: `No event at ${time} on ${date}. Next event is "${nearestEvent.title}" at ${nearestEvent.from}`,
        }
      }

      return {
        found: false as const,
        message: `No event found at ${time} on ${date}. No upcoming events for the day.`,
      }
    } catch (error) {
      if (error instanceof Error) {
        return {
          found: false as const,
          message: `Failed to read events: ${error.message}`,
        }
      }
      return {
        found: false as const,
        message: "Failed to read events: Unknown error",
      }
    }
  },
})