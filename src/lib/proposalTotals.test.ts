import { describe, expect, it } from "vitest";
import { buildProposalRoleSummaries, formatProposalRoleLabel } from "./proposalTotals";

describe("proposalTotals", () => {
  it("shows vehicle official roles as operational", () => {
    expect(formatProposalRoleLabel("oficial")).toBe("Operacional");
    expect(formatProposalRoleLabel("operacional")).toBe("Operacional");
  });

  it("summarizes repeated displayed roles once per report", () => {
    const reports = [
      { no_reporte: "0522", roles: ["oficial", "acompanante"] },
      { no_reporte: "0532", roles: ["oficial", "operacional"] },
      { no_reporte: "0533", roles: ["chofer"] },
    ];

    const summaries = buildProposalRoleSummaries(
      reports,
      (report) => report.roles,
      (report) => report.no_reporte,
      ["acompanante"],
    );

    expect(summaries).toEqual([
      {
        label: "Operacional",
        count: 2,
        reportNumbers: ["0522", "0532"],
      },
      {
        label: "Chofer",
        count: 1,
        reportNumbers: ["0533"],
      },
    ]);
  });
});
