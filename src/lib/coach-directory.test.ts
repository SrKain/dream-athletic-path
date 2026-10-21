import { describe, it, expect, vi } from "vitest";
import { updateUniversityCoachAtomic, deleteUniversityCoachAtomic } from "./coach-directory.server";

describe("Coach Directory Atomic Operations Suite", () => {
  it("updates existing coach in universities.coaches without wiping other coaches", async () => {
    const existingCoaches = [
      {
        id: "c-1",
        first_name: "John",
        last_name: "Doe",
        email: "john@ucla.edu",
        role: "Head Coach",
      },
      {
        id: "c-2",
        first_name: "Jane",
        last_name: "Smith",
        email: "jane@ucla.edu",
        role: "Assistant Coach",
      },
    ];

    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy });

    const mockAdmin = {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "uni-1",
                coaches: existingCoaches,
                updated_at: "2026-10-21T00:00:00Z",
              },
              error: null,
            }),
          }),
        }),
        update: updateSpy,
      })),
    } as unknown as Parameters<typeof updateUniversityCoachAtomic>[2];

    const res = await updateUniversityCoachAtomic(
      "uni-1",
      {
        id: "c-1",
        first_name: "Johnny",
        last_name: "Doe",
        email: "john@ucla.edu",
        role: "Associate Head Coach",
      },
      mockAdmin,
    );

    expect(res.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        coaches: expect.arrayContaining([
          expect.objectContaining({
            id: "c-1",
            first_name: "Johnny",
            role: "Associate Head Coach",
          }),
          expect.objectContaining({
            id: "c-2",
            first_name: "Jane",
          }),
        ]),
      }),
    );
  });

  it("adds new coach to universities.coaches when id does not exist", async () => {
    const existingCoaches = [
      {
        id: "c-1",
        first_name: "John",
        last_name: "Doe",
        email: "john@ucla.edu",
      },
    ];

    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy });

    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "uni-1", coaches: existingCoaches },
              error: null,
            }),
          }),
        }),
        update: updateSpy,
      })),
    } as unknown as Parameters<typeof updateUniversityCoachAtomic>[2];

    const res = await updateUniversityCoachAtomic(
      "uni-1",
      {
        first_name: "New",
        last_name: "Coach",
        email: "new@ucla.edu",
        role: "Recruiting Coordinator",
      },
      mockAdmin,
    );

    expect(res.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        coaches: expect.arrayContaining([
          expect.objectContaining({ email: "john@ucla.edu" }),
          expect.objectContaining({ email: "new@ucla.edu", role: "Recruiting Coordinator" }),
        ]),
      }),
    );
  });

  it("removes coach atomically without touching other coaches", async () => {
    const existingCoaches = [
      { id: "c-1", email: "john@ucla.edu" },
      { id: "c-2", email: "jane@ucla.edu" },
    ];

    const eqSpy = vi.fn().mockResolvedValue({ error: null });
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy });

    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: "uni-1", coaches: existingCoaches },
              error: null,
            }),
          }),
        }),
        update: updateSpy,
      })),
    } as unknown as Parameters<typeof updateUniversityCoachAtomic>[2];

    const res = await deleteUniversityCoachAtomic("uni-1", "c-1", mockAdmin);
    expect(res.success).toBe(true);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        coaches: [expect.objectContaining({ id: "c-2" })],
      }),
    );
  });
});
