import { expect, test } from "@playwright/test";

const baseUser = {
  id: "u-mfa-1",
  organizationId: "org-1",
  name: "Maria Santos",
  email: "maria@example.com",
  role: "EMPLOYEE",
  employeeId: "e-emp-1",
  mfaEnabled: false,
};

const employeeProfile = {
  id: "e-emp-1",
  employeeNumber: "EMP-2026-001",
  firstName: "Maria",
  lastName: "Santos",
  email: "maria@example.com",
  residentialAddress: "Makati City",
  employmentStatus: "ACTIVE",
  employmentType: "REGULAR",
  department: { id: "dept-1", name: "Engineering", code: "ENG" },
  branch: { id: "br-1", name: "Head Office" },
  compensation: {
    id: "comp-1",
    basicRateMonthlyCents: 5000000,
    basicRateDailyCents: 192308,
    basicRateHourlyCents: 24038,
  },
  leaveBalances: [],
};

test.describe("Multi-Factor Authentication (TOTP)", () => {
  test("enforces two-step login challenge when user has MFA enabled", async ({
    page,
  }) => {
    let signedIn = false;
    let mfaAttemptCount = 0;

    await page.route("**/trpc/**", async (route) => {
      const request = route.request();
      const paths = (
        new URL(request.url()).pathname.split("/trpc/")[1] ?? ""
      ).split(",");

      const results = paths.map((path: string) => {
        if (path === "auth.login") {
          return {
            result: {
              data: {
                json: {
                  requiresMfa: true,
                  mfaTicket: "mock-mfa-ticket-xyz",
                },
              },
            },
          };
        }

        if (path === "auth.verifyMfa") {
          mfaAttemptCount++;
          if (mfaAttemptCount === 1) {
            return {
              error: {
                json: {
                  message: "Invalid authenticator or backup code",
                  code: -32001,
                  data: { code: "UNAUTHORIZED", httpStatus: 401 },
                },
              },
            };
          }
          signedIn = true;
          return {
            result: {
              data: {
                json: {
                  user: { ...baseUser, mfaEnabled: true },
                  expiresAt: new Date(
                    Date.now() + 8 * 3600 * 1000,
                  ).toISOString(),
                },
              },
            },
          };
        }

        if (path === "auth.me") {
          if (!signedIn) {
            return {
              error: {
                json: {
                  message: "Unauthorized",
                  code: -32001,
                  data: { code: "UNAUTHORIZED", httpStatus: 401 },
                },
              },
            };
          }
          return {
            result: {
              data: { json: { ...baseUser, mfaEnabled: true } },
            },
          };
        }

        if (path === "dashboard.getOverview") {
          return {
            result: {
              data: {
                json: {
                  employees: {
                    total: 1,
                    active: 1,
                    onLeave: 0,
                    resigned: 0,
                    terminated: 0,
                    other: 0,
                  },
                  payroll: { latestRun: null, recentRuns: [] },
                  leaves: { pendingCount: 0 },
                  loans: { activeCount: 0, totalOutstandingCents: 0 },
                  audit: [],
                },
              },
            },
          };
        }

        return { result: { data: { json: null } } };
      });

      const hasError = results.some((r) => "error" in r);
      await route.fulfill({
        status: hasError ? 401 : 200,
        contentType: "application/json",
        body: JSON.stringify(results.length === 1 ? results[0] : results),
      });
    });

    await page.goto("/");

    // 1. Enter email and password
    await page.fill("#email", "maria@example.com");
    await page.fill("#password", "Password123456!");
    await page.click('button[type="submit"]:has-text("Login")');

    // 2. Expect MFA challenge step
    await expect(
      page.getByRole("heading", { name: "Two-Factor Authentication" }),
    ).toBeVisible();
    await expect(
      page.getByText("Enter the 6-digit code from your authenticator app"),
    ).toBeVisible();

    // 3. Enter incorrect code first -> verifies error state
    await page.fill("#mfaCode", "000000");
    await page.click('button[type="submit"]:has-text("Verify and Login")');
    await expect(
      page.getByText("Invalid authenticator or backup code"),
    ).toBeVisible();

    // 4. Test "Back to Login" button returns to credentials
    await page.click('button:has-text("Back to Login")');
    await expect(
      page.getByRole("heading", { name: "Login to your account" }),
    ).toBeVisible();

    // 5. Submit credentials again and verify with valid code
    await page.fill("#password", "Password123456!");
    await page.click('button[type="submit"]:has-text("Login")');
    await expect(
      page.getByRole("heading", { name: "Two-Factor Authentication" }),
    ).toBeVisible();
    await page.fill("#mfaCode", "123456");
    await page.click('button[type="submit"]:has-text("Verify and Login")');

    // 6. Successfully authenticated into portal
    await expect(page).toHaveURL(/\/portal/);
  });

  test("allows setup of MFA and generates backup codes in My Profile", async ({
    page,
  }) => {
    let signedIn = false;
    let currentUser = { ...baseUser, mfaEnabled: false };
    const mockBackupCodes = [
      "A1B2-C3D4",
      "E5F6-G7H8",
      "I9J0-K1L2",
      "M3N4-O5P6",
      "Q7R8-S9T0",
      "U1V2-W3X4",
      "Y5Z6-A7B8",
      "C9D0-E1F2",
      "G3H4-I5J6",
      "K7L8-M9N0",
    ];

    await page.route("**/trpc/**", async (route) => {
      const request = route.request();
      const paths = (
        new URL(request.url()).pathname.split("/trpc/")[1] ?? ""
      ).split(",");

      const results = paths.map((path: string) => {
        if (path === "auth.login") {
          signedIn = true;
          return { result: { data: { json: { user: currentUser } } } };
        }
        if (path === "auth.me") {
          if (!signedIn) {
            return {
              error: {
                json: {
                  message: "Unauthorized",
                  code: -32001,
                  data: { code: "UNAUTHORIZED", httpStatus: 401 },
                },
              },
            };
          }
          return { result: { data: { json: currentUser } } };
        }
        if (path === "dashboard.getOverview") {
          return {
            result: {
              data: {
                json: {
                  employees: {
                    total: 1,
                    active: 1,
                    onLeave: 0,
                    resigned: 0,
                    terminated: 0,
                    other: 0,
                  },
                  payroll: { latestRun: null, recentRuns: [] },
                  leaves: { pendingCount: 0 },
                  loans: { activeCount: 0, totalOutstandingCents: 0 },
                  audit: [],
                },
              },
            },
          };
        }
        if (path === "employees.getMyProfile") {
          return { result: { data: { json: employeeProfile } } };
        }
        if (path === "leaves.listRequests") {
          return { result: { data: { json: [] } } };
        }
        if (path === "payroll.getMyPayslips") {
          return { result: { data: { json: [] } } };
        }
        if (path === "auth.setupMfa") {
          return {
            result: {
              data: {
                json: {
                  secret: "NKFR7NX6DXAHLCEO4VDEP3WPETCW4SEP",
                  qrUri:
                    "otpauth://totp/Payroll:maria%40example.com?secret=NKFR7NX6DXAHLCEO4VDEP3WPETCW4SEP&issuer=Payroll",
                },
              },
            },
          };
        }
        if (path === "auth.confirmMfa") {
          currentUser = { ...currentUser, mfaEnabled: true };
          return {
            result: {
              data: {
                json: {
                  backupCodes: mockBackupCodes,
                },
              },
            },
          };
        }
        if (path === "auth.disableMfa") {
          currentUser = { ...currentUser, mfaEnabled: false };
          return { result: { data: { json: { success: true } } } };
        }
        return { result: { data: { json: null } } };
      });

      const hasError = results.some((r) => "error" in r);
      await route.fulfill({
        status: hasError ? 401 : 200,
        contentType: "application/json",
        body: JSON.stringify(results.length === 1 ? results[0] : results),
      });
    });

    // Sign in directly
    await page.goto("/");
    await page.fill("#email", "maria@example.com");
    await page.fill("#password", "Password123456!");
    await page.click('button[type="submit"]:has-text("Login")');
    await expect(page).toHaveURL(/\/portal/);

    // Navigate to My Profile
    await page.goto("/portal/my-profile");

    // Verify MFA card is visible with "Disabled" status
    await expect(
      page.getByRole("heading", { name: "Two-Factor Authentication (TOTP)" }),
    ).toBeVisible();
    await expect(page.getByText("Disabled").first()).toBeVisible();

    // Click "Set Up 2FA"
    await page.click('button:has-text("Set Up 2FA")');

    // Verify Setup step 1 shows the secret key
    await expect(
      page.getByText("Step 1: Add to Your Authenticator App"),
    ).toBeVisible();
    await expect(
      page.getByText("NKFR7NX6DXAHLCEO4VDEP3WPETCW4SEP"),
    ).toBeVisible();

    // Enter verification code and submit
    await page.fill("#confirmMfaCode", "123456");
    await page.click('button:has-text("Verify and Activate")');

    // Verify Backup codes step
    await expect(
      page.getByText("Two-Factor Authentication is Enabled!"),
    ).toBeVisible();
    await expect(page.getByText("A1B2-C3D4")).toBeVisible();
    await expect(page.getByText("K7L8-M9N0")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Copy All Backup Codes" }),
    ).toBeVisible();

    // Dismiss backup codes view
    await page.click('button:has-text("I Have Saved My Backup Codes")');

    // Verify Active status
    await expect(page.getByText("Active & Enforced")).toBeVisible();

    // Now test Disabling MFA
    await page.click('button:has-text("Disable 2FA")');
    await expect(
      page.getByText("Confirm Disabling Two-Factor Authentication"),
    ).toBeVisible();

    await page.fill("#disablePassword", "Password123456!");
    await page.fill("#disableCode", "123456");
    await page.click('button:has-text("Confirm Disable")');

    // Status returns to Disabled
    await expect(page.getByText("Disabled").first()).toBeVisible();
  });
});
