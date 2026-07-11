import { checkAndAwardBadges } from "@/lib/karma/karma-utils";

type BadgeRow = {
  id: string;
  slug: string;
  condition: string;
};

type UserRow = {
  karmaScore: number;
  currentStreak: number;
};

let badgeRows: BadgeRow[] = [];
let earnedRows: Array<{ badgeId: string }> = [];
let userRow: UserRow | undefined;
let totalRepliesRows: Array<{ total: number }> = [];
let acceptedAnswerRows: Array<{ total: number }> = [];
let insertRows: Array<{ id: string }> | undefined = [];
let selectCall = 0;

jest.mock("@/configs/db", () => {
  const mockInsertReturning = jest.fn(() => Promise.resolve(insertRows));
  const mockInsertOnConflict = jest.fn(() => ({
    returning: mockInsertReturning,
  }));
  const mockInsertValues = jest.fn(() => ({
    onConflictDoNothing: mockInsertOnConflict,
  }));
  const mockInsert = jest.fn(() => ({
    values: mockInsertValues,
  }));

  const mockLimit = jest.fn(() => Promise.resolve(userRow ? [userRow] : []));
  const mockSelect = jest.fn(() => ({
    from: jest.fn(() => {
      selectCall += 1;

      if (selectCall === 1) {
        return Promise.resolve(badgeRows);
      }

      if (selectCall === 2) {
        return {
          where: jest.fn(() => Promise.resolve(earnedRows)),
        };
      }

      if (selectCall === 3) {
        return {
          where: jest.fn(() => ({
            limit: mockLimit,
          })),
        };
      }

      if (selectCall === 4) {
        return {
          where: jest.fn(() => Promise.resolve(totalRepliesRows)),
        };
      }

      return {
        innerJoin: jest.fn(() => ({
          where: jest.fn(() => Promise.resolve(acceptedAnswerRows)),
        })),
      };
    }),
  }));

  return {
    db: {
      select: mockSelect,
      insert: mockInsert,
    },
    _mocks: {
      mockSelect,
      mockInsert,
      mockInsertReturning,
      mockInsertOnConflict,
      mockInsertValues,
      mockLimit,
      resetState: () => {
        badgeRows = [];
        earnedRows = [];
        userRow = undefined;
        totalRepliesRows = [];
        acceptedAnswerRows = [];
        insertRows = [];
        selectCall = 0;
      },
      setBadgeRows: (rows: BadgeRow[]) => {
        badgeRows = rows;
      },
      setEarnedRows: (rows: Array<{ badgeId: string }>) => {
        earnedRows = rows;
      },
      setUserRow: (row: UserRow | undefined) => {
        userRow = row;
      },
      setTotalRepliesRows: (rows: Array<{ total: number }>) => {
        totalRepliesRows = rows;
      },
      setAcceptedAnswerRows: (rows: Array<{ total: number }>) => {
        acceptedAnswerRows = rows;
      },
      setInsertRows: (rows: Array<{ id: string }> | undefined) => {
        insertRows = rows;
      },
    },
  };
});

jest.mock("drizzle-orm", () => ({
  eq: jest.fn(),
  and: jest.fn(),
  count: jest.fn(() => "count"),
  countDistinct: jest.fn(() => "countDistinct"),
  sql: jest.fn(),
}));

const {
  mockInsert,
  mockInsertReturning,
  mockLimit,
  resetState,
  setAcceptedAnswerRows,
  setBadgeRows,
  setEarnedRows,
  setInsertRows,
  setTotalRepliesRows,
  setUserRow,
} = require("@/configs/db")._mocks;

describe("checkAndAwardBadges", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetState();
  });

  it("returns a badge when the insert succeeds", async () => {
    setBadgeRows([
      {
        id: "badge-1",
        slug: "first-badge",
        condition: JSON.stringify({ type: "karma_milestone", karma: 50 }),
      },
    ]);
    setEarnedRows([]);
    setUserRow({
      karmaScore: 75,
      currentStreak: 0,
    });
    setTotalRepliesRows([{ total: 1 }]);
    setAcceptedAnswerRows([{ total: 0 }]);
    setInsertRows([{ id: "user-badge-row" }]);

    const result = await checkAndAwardBadges("student@example.com");

    expect(result).toEqual(["first-badge"]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsertReturning).toHaveBeenCalledTimes(1);
    expect(mockLimit).toHaveBeenCalledTimes(1);
  });

  it("does not report a badge when conflict suppression skips the insert", async () => {
    setBadgeRows([
      {
        id: "badge-1",
        slug: "first-badge",
        condition: JSON.stringify({ type: "karma_milestone", karma: 50 }),
      },
    ]);
    setEarnedRows([]);
    setUserRow({
      karmaScore: 75,
      currentStreak: 0,
    });
    setTotalRepliesRows([{ total: 1 }]);
    setAcceptedAnswerRows([{ total: 0 }]);
    setInsertRows([]);

    const result = await checkAndAwardBadges("student@example.com");

    expect(result).toEqual([]);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsertReturning).toHaveBeenCalledTimes(1);
    expect(mockLimit).toHaveBeenCalledTimes(1);
  });
});
