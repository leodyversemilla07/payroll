"use client";

import { useWorkspaceUser } from "@/components/user-context";
import { SectionGate, SectionHeader } from "@/components/workspace-section";
import { useStaffEmployees } from "@/features/employees/use-staff-employees";
import { LeavePoliciesSection } from "@/features/leaves/leave-policies-section";
import { LeavesSection } from "@/features/leaves/leaves-section";
import { PendingLeaveApprovalsSection } from "@/features/leaves/pending-leave-approvals";

export default function LeavesPage() {
  const props = useStaffEmployees();
  const { user, canManageLeavePolicies, canApproveLeaves } = useWorkspaceUser();
  return (
    <>
      <SectionHeader sectionId="leaves" />
      <SectionGate sectionId="leaves">
        <div className="space-y-6">
          {canApproveLeaves && <PendingLeaveApprovalsSection />}
          <LeavesSection
            {...props}
            canDecide={canApproveLeaves}
            actorEmployeeId={user.employeeId}
          />
          <LeavePoliciesSection canManage={canManageLeavePolicies} />
        </div>
      </SectionGate>
    </>
  );
}
