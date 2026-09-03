/**
 * Seeds a realistic multi-region restaurant group: org hierarchy, people,
 * checklists, schedules, and ~45 days of submission history so the dashboards
 * have something to say on first run.
 *
 *   npm run db:seed
 */
import { PrismaClient, Daypart, ItemType, Role, ScopeLevel } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "checklists2026";
const HISTORY_DAYS = 45;

// Deterministic RNG so reseeding produces the same demo fleet.
let seed = 20260903;
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function pick<T>(items: T[]): T {
  return items[Math.floor(random() * items.length)];
}
function chance(p: number) {
  return random() < p;
}

const REGIONS = [
  {
    code: "MW",
    name: "Midwest",
    timezone: "America/Chicago",
    districts: [
      { code: "MW-CHI", name: "Chicago Metro", cities: ["Chicago", "Evanston", "Naperville", "Oak Park", "Schaumburg"], state: "IL" },
      { code: "MW-MSP", name: "Twin Cities", cities: ["Minneapolis", "St. Paul", "Bloomington", "Edina"], state: "MN" },
      { code: "MW-STL", name: "Gateway", cities: ["St. Louis", "Kirkwood", "Chesterfield", "Columbia"], state: "MO" },
    ],
  },
  {
    code: "SE",
    name: "Southeast",
    timezone: "America/New_York",
    districts: [
      { code: "SE-ATL", name: "Atlanta North", cities: ["Atlanta", "Marietta", "Alpharetta", "Decatur", "Sandy Springs"], state: "GA" },
      { code: "SE-FLA", name: "Central Florida", cities: ["Orlando", "Winter Park", "Kissimmee", "Lakeland"], state: "FL" },
      { code: "SE-CAR", name: "Carolinas", cities: ["Charlotte", "Raleigh", "Durham", "Greenville"], state: "NC" },
    ],
  },
  {
    code: "WE",
    name: "West",
    timezone: "America/Los_Angeles",
    districts: [
      { code: "WE-PHX", name: "Valley", cities: ["Phoenix", "Tempe", "Scottsdale", "Mesa", "Chandler"], state: "AZ" },
      { code: "WE-PDX", name: "Cascade", cities: ["Portland", "Beaverton", "Gresham", "Vancouver"], state: "OR" },
    ],
  },
];

const STORE_SUFFIXES = [
  "Main St", "Northgate", "Riverside", "Town Center", "University", "Crossroads",
  "Market Square", "Airport", "Lakeview", "Highland", "Parkway", "Westfield",
  "Union Station", "Grandview", "Sunset", "Commerce", "Broadway", "Fairview",
];

async function main() {
  console.log("Clearing existing data…");
  await prisma.activityLog.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.correctiveAction.deleteMany();
  await prisma.itemResponse.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.scheduleLocation.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.templateItem.deleteMany();
  await prisma.templateSection.deleteMany();
  await prisma.checklistTemplate.deleteMany();
  await prisma.session.deleteMany();
  await prisma.userScope.deleteMany();
  await prisma.user.deleteMany();
  await prisma.location.deleteMany();
  await prisma.district.deleteMany();
  await prisma.region.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: { name: "PG1 Restaurant Group", slug: "pg1", timezone: "America/Chicago" },
  });
  console.log(`Created ${org.name}`);

  // --- hierarchy ----------------------------------------------------------
  let storeNumber = 1000;
  const allLocations: { id: string; districtId: string; regionId: string }[] = [];
  const districtIds: { id: string; regionId: string; name: string }[] = [];
  const regionIds: { id: string; name: string }[] = [];

  for (const regionSpec of REGIONS) {
    const region = await prisma.region.create({
      data: { orgId: org.id, name: regionSpec.name, code: regionSpec.code },
    });
    regionIds.push({ id: region.id, name: region.name });

    for (const districtSpec of regionSpec.districts) {
      const district = await prisma.district.create({
        data: {
          orgId: org.id,
          regionId: region.id,
          name: districtSpec.name,
          code: districtSpec.code,
        },
      });
      districtIds.push({ id: district.id, regionId: region.id, name: district.name });

      const storeCount = 6 + Math.floor(random() * 4); // 6–9 stores per district
      for (let i = 0; i < storeCount; i++) {
        storeNumber += 1;
        const city = districtSpec.cities[i % districtSpec.cities.length];
        const location = await prisma.location.create({
          data: {
            orgId: org.id,
            districtId: district.id,
            name: `${city} ${pick(STORE_SUFFIXES)}`,
            code: String(storeNumber),
            city,
            state: districtSpec.state,
            timezone: regionSpec.timezone,
            phone: `(${300 + Math.floor(random() * 600)}) 555-${String(1000 + Math.floor(random() * 8999))}`,
          },
        });
        allLocations.push({
          id: location.id,
          districtId: district.id,
          regionId: region.id,
        });
      }
    }
  }
  console.log(`Created ${allLocations.length} locations`);

  // --- people -------------------------------------------------------------
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const admin = await prisma.user.create({
    data: {
      orgId: org.id,
      name: "Jordan Theisen",
      email: "admin@pg1.test",
      role: Role.ADMIN,
      passwordHash,
      scopes: { create: [{ level: ScopeLevel.ORG }] },
    },
  });

  const regionalUsers = await Promise.all(
    regionIds.map((region, index) =>
      prisma.user.create({
        data: {
          orgId: org.id,
          name: `${["Priya Raman", "Marcus Webb", "Dana Kovach"][index]}`,
          email: `rd.${region.name.toLowerCase().replace(/\s+/g, "")}@pg1.test`,
          role: Role.REGIONAL,
          passwordHash,
          scopes: { create: [{ level: ScopeLevel.REGION, regionId: region.id }] },
        },
      }),
    ),
  );

  const dmNames = [
    "Elena Ortiz", "Sam Whitfield", "Ari Nakamura", "Rachel Boone",
    "Tobias Klein", "Nia Ferrell", "Owen Brady", "Camille Duarte",
  ];
  const districtUsers = await Promise.all(
    districtIds.map((district, index) =>
      prisma.user.create({
        data: {
          orgId: org.id,
          name: dmNames[index % dmNames.length],
          email: `dm.${district.name.toLowerCase().replace(/[^a-z]/g, "")}@pg1.test`,
          role: Role.DISTRICT,
          passwordHash,
          scopes: { create: [{ level: ScopeLevel.DISTRICT, districtId: district.id }] },
        },
      }),
    ),
  );

  const firstNames = ["Ava", "Liam", "Sofia", "Noah", "Maya", "Ethan", "Zoe", "Caleb", "Iris", "Diego", "Nina", "Omar"];
  const lastNames = ["Reyes", "Nguyen", "Carter", "Okafor", "Silva", "Hughes", "Mercer", "Patel", "Lombardi", "Byrne"];

  const storeUsers: { id: string; locationId: string; role: Role }[] = [];
  for (const [index, location] of allLocations.entries()) {
    const gm = await prisma.user.create({
      data: {
        orgId: org.id,
        name: `${firstNames[index % firstNames.length]} ${lastNames[index % lastNames.length]}`,
        email: `gm.${index + 1}@pg1.test`,
        role: Role.GM,
        passwordHash,
        scopes: { create: [{ level: ScopeLevel.LOCATION, locationId: location.id }] },
      },
    });
    storeUsers.push({ id: gm.id, locationId: location.id, role: Role.GM });

    const manager = await prisma.user.create({
      data: {
        orgId: org.id,
        name: `${firstNames[(index + 5) % firstNames.length]} ${lastNames[(index + 3) % lastNames.length]}`,
        email: `mgr.${index + 1}@pg1.test`,
        role: Role.MANAGER,
        passwordHash,
        scopes: { create: [{ level: ScopeLevel.LOCATION, locationId: location.id }] },
      },
    });
    storeUsers.push({ id: manager.id, locationId: location.id, role: Role.MANAGER });
  }
  console.log(
    `Created ${1 + regionalUsers.length + districtUsers.length + storeUsers.length} users`,
  );

  // --- checklists ---------------------------------------------------------
  const templates = await Promise.all(
    TEMPLATE_SPECS.map(async (spec) => {
      const template = await prisma.checklistTemplate.create({
        data: {
          orgId: org.id,
          name: spec.name,
          description: spec.description,
          category: spec.category,
          status: "PUBLISHED",
          passingScore: spec.passingScore,
        },
      });

      for (const [sectionIndex, sectionSpec] of spec.sections.entries()) {
        const section = await prisma.templateSection.create({
          data: {
            templateId: template.id,
            title: sectionSpec.title,
            helpText: sectionSpec.helpText ?? null,
            position: sectionIndex,
          },
        });

        await prisma.templateItem.createMany({
          data: sectionSpec.items.map((item, itemIndex) => ({
            sectionId: section.id,
            label: item.label,
            helpText: item.helpText ?? null,
            type: item.type,
            position: itemIndex,
            required: item.required ?? true,
            critical: item.critical ?? false,
            weight: item.weight ?? 1,
            requirePhoto: item.requirePhoto ?? false,
            photoOnFail: item.photoOnFail ?? true,
            noteOnFail: item.noteOnFail ?? true,
            actionOnFail: item.actionOnFail ?? true,
            minValue: item.minValue ?? null,
            maxValue: item.maxValue ?? null,
            unit: item.unit ?? null,
            options: item.options ?? [],
            failingOptions: item.failingOptions ?? [],
          })),
        });
      }

      return { id: template.id, name: template.name, passingScore: spec.passingScore };
    }),
  );
  console.log(`Created ${templates.length} checklist templates`);

  // --- schedules ----------------------------------------------------------
  const scheduleSpecs = [
    { templateIndex: 0, name: "Opening walk", daypart: Daypart.OPENING, startTime: "05:00", dueTime: "09:00", days: [0, 1, 2, 3, 4, 5, 6] },
    { templateIndex: 1, name: "Lunch line check", daypart: Daypart.LUNCH, startTime: "10:30", dueTime: "12:30", days: [0, 1, 2, 3, 4, 5, 6] },
    { templateIndex: 1, name: "Dinner line check", daypart: Daypart.DINNER, startTime: "16:00", dueTime: "18:00", days: [0, 1, 2, 3, 4, 5, 6] },
    { templateIndex: 2, name: "Closing walk", daypart: Daypart.CLOSING, startTime: "20:00", dueTime: "23:30", days: [0, 1, 2, 3, 4, 5, 6] },
    { templateIndex: 3, name: "Weekly brand standards", daypart: Daypart.AFTERNOON, startTime: "13:00", dueTime: "17:00", days: [3] },
  ];

  const schedules = await Promise.all(
    scheduleSpecs.map(async (spec) => {
      const schedule = await prisma.schedule.create({
        data: {
          orgId: org.id,
          templateId: templates[spec.templateIndex].id,
          name: spec.name,
          daypart: spec.daypart,
          startTime: spec.startTime,
          dueTime: spec.dueTime,
          daysOfWeek: spec.days,
          locations: { create: allLocations.map((l) => ({ locationId: l.id })) },
        },
      });
      return {
        id: schedule.id,
        templateId: templates[spec.templateIndex].id,
        daypart: spec.daypart,
        dueTime: spec.dueTime,
        days: spec.days,
        passingScore: templates[spec.templateIndex].passingScore,
      };
    }),
  );
  console.log(`Created ${schedules.length} schedules`);

  // --- history ------------------------------------------------------------
  const items = await prisma.templateItem.findMany({
    select: {
      id: true,
      label: true,
      type: true,
      critical: true,
      weight: true,
      minValue: true,
      maxValue: true,
      actionOnFail: true,
      failingOptions: true,
      options: true,
      section: { select: { templateId: true } },
    },
  });
  const itemsByTemplate = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByTemplate.get(item.section.templateId) ?? [];
    list.push(item);
    itemsByTemplate.set(item.section.templateId, list);
  }

  const usersByLocation = new Map<string, string[]>();
  for (const person of storeUsers) {
    const list = usersByLocation.get(person.locationId) ?? [];
    list.push(person.id);
    usersByLocation.set(person.locationId, list);
  }

  // Give each store a persistent "operating quality" so rankings mean something.
  const storeQuality = new Map<string, number>();
  for (const location of allLocations) {
    storeQuality.set(location.id, 0.78 + random() * 0.2);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let submissionCount = 0;
  let actionCount = 0;

  for (let dayOffset = HISTORY_DAYS; dayOffset >= 0; dayOffset--) {
    const businessDate = new Date(today);
    businessDate.setUTCDate(businessDate.getUTCDate() - dayOffset);
    const dow = businessDate.getUTCDay();

    for (const location of allLocations) {
      const quality = storeQuality.get(location.id)!;
      const staff = usersByLocation.get(location.id) ?? [];
      if (!staff.length) continue;

      for (const schedule of schedules) {
        if (!schedule.days.includes(dow)) continue;
        // Today is partially complete so the "due today" view has real work in it.
        if (dayOffset === 0 && chance(0.45)) continue;
        // Historical completion tracks store quality.
        if (dayOffset > 0 && !chance(0.86 + quality * 0.12)) continue;

        const templateItems = itemsByTemplate.get(schedule.templateId) ?? [];
        if (!templateItems.length) continue;

        const [hour, minute] = schedule.dueTime.split(":").map(Number);
        const submittedAt = new Date(businessDate);
        submittedAt.setUTCHours(hour, Math.max(0, minute - Math.floor(random() * 90)));
        const startedAt = new Date(submittedAt.getTime() - (6 + random() * 18) * 60000);

        let weightTotal = 0;
        let weightEarned = 0;
        let itemsPassed = 0;
        let itemsFailed = 0;
        let criticalFailure = false;

        const responses: {
          itemId: string;
          label: string;
          passed: boolean | null;
          numericValue: number | null;
          boolValue: boolean | null;
          selected: string[];
          note: string | null;
          critical: boolean;
          actionOnFail: boolean;
        }[] = [];

        for (const item of templateItems) {
          const failProbability = item.critical
            ? (1 - quality) * 0.08
            : (1 - quality) * 0.35;
          const fails = chance(failProbability);

          let passed: boolean | null = !fails;
          let numericValue: number | null = null;
          let boolValue: boolean | null = null;
          let selected: string[] = [];

          switch (item.type) {
            case ItemType.TEMPERATURE:
            case ItemType.NUMBER: {
              const min = item.minValue ?? 0;
              const max = item.maxValue ?? min + 10;
              numericValue = fails
                ? Math.round((max + 1 + random() * 6) * 10) / 10
                : Math.round((min + random() * (max - min)) * 10) / 10;
              break;
            }
            case ItemType.RATING:
              numericValue = fails ? 1 + Math.floor(random() * 2) : 3 + Math.floor(random() * 3);
              break;
            case ItemType.SELECT:
              selected = fails && item.failingOptions.length
                ? [item.failingOptions[0]]
                : [item.options.find((o) => !item.failingOptions.includes(o)) ?? item.options[0]];
              break;
            case ItemType.TEXT:
            case ItemType.SIGNATURE:
            case ItemType.PHOTO:
              passed = null;
              break;
            default:
              boolValue = !fails;
          }

          if (passed !== null) {
            const weight = Math.max(1, item.weight);
            weightTotal += weight;
            if (passed) {
              weightEarned += weight;
              itemsPassed += 1;
            } else {
              itemsFailed += 1;
              if (item.critical) criticalFailure = true;
            }
          }

          responses.push({
            itemId: item.id,
            label: item.label,
            passed,
            numericValue,
            boolValue,
            selected,
            note: passed === false ? pick(FAILURE_NOTES) : null,
            critical: item.critical,
            actionOnFail: item.actionOnFail,
          });
        }

        const score =
          weightTotal > 0 ? Math.round((weightEarned / weightTotal) * 1000) / 10 : null;
        const passedOverall =
          !criticalFailure && (score === null || score >= (schedule.passingScore ?? 0));

        const submission = await prisma.submission.create({
          data: {
            orgId: org.id,
            locationId: location.id,
            templateId: schedule.templateId,
            scheduleId: schedule.id,
            userId: pick(staff),
            status: "SUBMITTED",
            daypart: schedule.daypart,
            businessDate,
            startedAt,
            submittedAt,
            score,
            passed: passedOverall,
            itemsTotal: itemsPassed + itemsFailed,
            itemsPassed,
            itemsFailed,
            clientKey: `seed:${location.id}:${schedule.id}:${businessDate.toISOString().slice(0, 10)}`,
          },
        });
        submissionCount += 1;

        await prisma.itemResponse.createMany({
          data: responses.map((response) => ({
            submissionId: submission.id,
            itemId: response.itemId,
            passed: response.passed,
            numericValue: response.numericValue,
            boolValue: response.boolValue,
            selected: response.selected,
            note: response.note,
            answeredAt: submittedAt,
          })),
        });

        // Older failures are mostly closed out; recent ones stay open.
        for (const response of responses) {
          if (response.passed !== false || !response.actionOnFail) continue;
          const resolved = dayOffset > 3 ? chance(0.9) : chance(0.35);
          await prisma.correctiveAction.create({
            data: {
              orgId: org.id,
              locationId: location.id,
              submissionId: submission.id,
              title: response.label,
              description: response.note,
              status: resolved ? (chance(0.6) ? "VERIFIED" : "RESOLVED") : chance(0.4) ? "IN_PROGRESS" : "OPEN",
              priority: response.critical ? "CRITICAL" : chance(0.25) ? "HIGH" : "MEDIUM",
              raisedById: pick(staff),
              assigneeId: chance(0.8) ? pick(staff) : null,
              dueAt: new Date(
                submittedAt.getTime() + (response.critical ? 4 : 24) * 3600 * 1000,
              ),
              resolvedAt: resolved
                ? new Date(submittedAt.getTime() + (2 + random() * 20) * 3600 * 1000)
                : null,
              resolutionNote: resolved ? pick(RESOLUTION_NOTES) : null,
              createdAt: submittedAt,
            },
          });
          actionCount += 1;
        }

        if (chance(0.02)) {
          await prisma.activityLog.create({
            data: {
              orgId: org.id,
              userId: pick(staff),
              action: "submission.submitted",
              entityType: "Submission",
              entityId: submission.id,
              locationId: location.id,
              summary: `Submitted a checklist scoring ${score ?? "—"}%`,
              createdAt: submittedAt,
            },
          });
        }
      }
    }
    if (dayOffset % 10 === 0) {
      console.log(`  …${HISTORY_DAYS - dayOffset + 1}/${HISTORY_DAYS + 1} days`);
    }
  }

  await prisma.activityLog.create({
    data: {
      orgId: org.id,
      userId: admin.id,
      action: "org.seeded",
      summary: `Demo data loaded: ${allLocations.length} stores, ${submissionCount} submissions`,
    },
  });

  console.log(`\nSeeded ${submissionCount} submissions and ${actionCount} corrective actions.`);
  console.log("\nSign in with:");
  console.log(`  Administrator     admin@pg1.test              / ${DEMO_PASSWORD}`);
  console.log(`  Regional Director rd.midwest@pg1.test         / ${DEMO_PASSWORD}`);
  console.log(`  District Manager  dm.chicagometro@pg1.test    / ${DEMO_PASSWORD}`);
  console.log(`  General Manager   gm.1@pg1.test               / ${DEMO_PASSWORD}`);
}

const FAILURE_NOTES = [
  "Found out of standard during the walk; corrected on the spot and re-checked.",
  "Unit was running warm — service call placed with the vendor.",
  "Team member re-trained on the standard during pre-shift.",
  "Product pulled and discarded, new batch pulled from the walk-in.",
  "Missing from the station; reordered through the weekly truck.",
  "Reset and cleaned, will re-verify on the next walk.",
];

const RESOLUTION_NOTES = [
  "Corrected during the shift and verified by the GM.",
  "Vendor replaced the part; temperature holding in range since.",
  "Re-trained the closing team and added it to the pre-shift huddle.",
  "Deep cleaned and re-inspected the following morning.",
];

interface ItemSpec {
  label: string;
  helpText?: string;
  type: ItemType;
  required?: boolean;
  critical?: boolean;
  weight?: number;
  requirePhoto?: boolean;
  photoOnFail?: boolean;
  noteOnFail?: boolean;
  actionOnFail?: boolean;
  minValue?: number;
  maxValue?: number;
  unit?: string;
  options?: string[];
  failingOptions?: string[];
}

const TEMPLATE_SPECS: {
  name: string;
  description: string;
  category: string;
  passingScore: number;
  sections: { title: string; helpText?: string; items: ItemSpec[] }[];
}[] = [
  {
    name: "Opening Walk",
    description:
      "Run before the doors open. Covers food safety, equipment and readiness for the first guest.",
    category: "Opening",
    passingScore: 95,
    sections: [
      {
        title: "Food safety",
        helpText: "Take readings before stocking the line.",
        items: [
          { label: "Walk-in cooler temperature", type: ItemType.TEMPERATURE, minValue: 33, maxValue: 40, unit: "°F", critical: true, weight: 3 },
          { label: "Walk-in freezer temperature", type: ItemType.TEMPERATURE, minValue: -10, maxValue: 5, unit: "°F", critical: true, weight: 3 },
          { label: "Reach-in prep cooler temperature", type: ItemType.TEMPERATURE, minValue: 33, maxValue: 40, unit: "°F", weight: 2 },
          { label: "Sanitizer bucket concentration", type: ItemType.NUMBER, minValue: 200, maxValue: 400, unit: "ppm", critical: true, weight: 3 },
          { label: "Thermometers calibrated and in place", type: ItemType.CHECKBOX },
          { label: "No expired product on the line or in the walk-in", type: ItemType.PASS_FAIL, critical: true, weight: 3, requirePhoto: false },
        ],
      },
      {
        title: "Equipment",
        items: [
          { label: "Fryers at temperature and filtered", type: ItemType.CHECKBOX, weight: 2 },
          { label: "Oil quality", type: ItemType.SELECT, options: ["Fresh", "Acceptable", "Needs changing"], failingOptions: ["Needs changing"], weight: 2 },
          { label: "Grill and flat-top cleaned and heated", type: ItemType.CHECKBOX },
          { label: "Ice machine clean and producing", type: ItemType.CHECKBOX },
          { label: "POS terminals online and drawers counted", type: ItemType.CHECKBOX },
        ],
      },
      {
        title: "Readiness",
        items: [
          { label: "Dining room set, floors clean", type: ItemType.PASS_FAIL },
          { label: "Restrooms stocked and clean", type: ItemType.PASS_FAIL, weight: 2 },
          { label: "Team in full uniform, hands washed", type: ItemType.PASS_FAIL, weight: 2 },
          { label: "Staffing matches the projection", type: ItemType.CHECKBOX },
          { label: "Opening manager signature", type: ItemType.SIGNATURE, actionOnFail: false, noteOnFail: false, photoOnFail: false },
        ],
      },
    ],
  },
  {
    name: "Line Check",
    description:
      "Temperature and quality check of every hot and cold holding station before the rush.",
    category: "Food Safety",
    passingScore: 95,
    sections: [
      {
        title: "Cold holding",
        items: [
          { label: "Cold well 1 temperature", type: ItemType.TEMPERATURE, minValue: 33, maxValue: 41, unit: "°F", critical: true, weight: 3 },
          { label: "Cold well 2 temperature", type: ItemType.TEMPERATURE, minValue: 33, maxValue: 41, unit: "°F", critical: true, weight: 3 },
          { label: "Salad prep cooler temperature", type: ItemType.TEMPERATURE, minValue: 33, maxValue: 41, unit: "°F", weight: 2 },
          { label: "All cold items date-labelled", type: ItemType.PASS_FAIL, weight: 2 },
        ],
      },
      {
        title: "Hot holding",
        items: [
          { label: "Hot well temperature", type: ItemType.TEMPERATURE, minValue: 140, maxValue: 190, unit: "°F", critical: true, weight: 3 },
          { label: "Soup / sauce holding temperature", type: ItemType.TEMPERATURE, minValue: 140, maxValue: 190, unit: "°F", weight: 2 },
          { label: "Hold times within standard", type: ItemType.PASS_FAIL, weight: 2 },
          { label: "Product appearance", type: ItemType.RATING, minValue: 3, actionOnFail: false },
        ],
      },
      {
        title: "Station condition",
        items: [
          { label: "Stations stocked to par", type: ItemType.CHECKBOX },
          { label: "Prep surfaces clean and sanitised", type: ItemType.PASS_FAIL, weight: 2 },
          { label: "Photo of the line", type: ItemType.PHOTO, required: false, actionOnFail: false, noteOnFail: false, photoOnFail: false },
        ],
      },
    ],
  },
  {
    name: "Closing Walk",
    description: "End-of-night close-out: cleaning, food safety and securing the building.",
    category: "Closing",
    passingScore: 92,
    sections: [
      {
        title: "Food safety",
        items: [
          { label: "All product wrapped, dated and stored", type: ItemType.PASS_FAIL, critical: true, weight: 3 },
          { label: "Walk-in cooler temperature", type: ItemType.TEMPERATURE, minValue: 33, maxValue: 40, unit: "°F", critical: true, weight: 3 },
          { label: "Cooling logs completed", type: ItemType.CHECKBOX, weight: 2 },
          { label: "Waste logged", type: ItemType.CHECKBOX },
        ],
      },
      {
        title: "Cleaning",
        items: [
          { label: "Fryers filtered and covered", type: ItemType.CHECKBOX, weight: 2 },
          { label: "Grill scraped and cleaned", type: ItemType.PASS_FAIL, weight: 2 },
          { label: "Floors swept and mopped", type: ItemType.PASS_FAIL },
          { label: "Dish area clean, no standing water", type: ItemType.PASS_FAIL },
          { label: "Trash out, dumpster area clear", type: ItemType.CHECKBOX },
          { label: "Restrooms cleaned and stocked", type: ItemType.PASS_FAIL },
        ],
      },
      {
        title: "Secure the building",
        items: [
          { label: "Deposit prepared and secured", type: ItemType.CHECKBOX, critical: true, weight: 3 },
          { label: "All doors locked, alarm set", type: ItemType.CHECKBOX, critical: true, weight: 3 },
          { label: "Closing manager signature", type: ItemType.SIGNATURE, actionOnFail: false, noteOnFail: false, photoOnFail: false },
        ],
      },
    ],
  },
  {
    name: "Brand Standards Audit",
    description:
      "Weekly leadership walk covering guest experience, presentation and team readiness.",
    category: "Brand Standards",
    passingScore: 88,
    sections: [
      {
        title: "Guest experience",
        items: [
          { label: "Greeting within 30 seconds", type: ItemType.PASS_FAIL, weight: 2 },
          { label: "Order accuracy spot check", type: ItemType.RATING, minValue: 4, weight: 2 },
          { label: "Drive-thru time on target", type: ItemType.NUMBER, minValue: 0, maxValue: 210, unit: "sec", weight: 2 },
          { label: "Guest feedback reviewed with the team", type: ItemType.CHECKBOX },
        ],
      },
      {
        title: "Presentation",
        items: [
          { label: "Exterior and signage clean and lit", type: ItemType.PASS_FAIL, requirePhoto: true },
          { label: "Menu boards current and undamaged", type: ItemType.PASS_FAIL },
          { label: "Dining room condition", type: ItemType.RATING, minValue: 3 },
          { label: "Merchandising set to the current window", type: ItemType.CHECKBOX },
        ],
      },
      {
        title: "Team",
        items: [
          { label: "Certifications current and posted", type: ItemType.PASS_FAIL, critical: true, weight: 3 },
          { label: "Schedule posted for next week", type: ItemType.CHECKBOX },
          { label: "Open corrective actions reviewed with the GM", type: ItemType.CHECKBOX, weight: 2 },
          { label: "Notes for the general manager", type: ItemType.TEXT, required: false, actionOnFail: false, noteOnFail: false, photoOnFail: false },
        ],
      },
    ],
  },
];

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
