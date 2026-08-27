namespace Booking.Application.Common.Models;

/// <summary>
/// Ku jeton frontend-i — përdoret vetëm për të ndërtuar linqe në email.
/// Bosh (rasti i parazgjedhur) do të thotë "pa linqe": njoftimet mbeten të plota,
/// thjesht referojnë klinikën me emër dhe ID në vend të një URL-je të gabuar.
/// </summary>
public sealed class FrontendSettings
{
    public const string SectionName = "Frontend";

    public string? BaseUrl { get; set; }

    /// <summary>Rruga e panelit ku SuperAdmin-i i rishikon klinikat (shih App.tsx).</summary>
    public string SuperAdminClinicsPath { get; set; } = "/super-admin/klinikat";

    /// <summary>Rruga ku ClinicAdmin-i i sheh klinikat e veta, përfshirë ato në pritje.</summary>
    public string MyClinicsPath { get; set; } = "/admin-panel/klinikat";

    /// <summary>Faqja e rivendosjes së fjalëkalimit (shih App.tsx) — pret ?token=&amp;email=.</summary>
    public string ResetPasswordPath { get; set; } = "/rivendos-fjalekalimin";

    /// <summary>Faqja e konfirmimit të email-it (shih App.tsx) — pret ?token=&amp;email=.</summary>
    public string ConfirmEmailPath { get; set; } = "/konfirmo-email";
}
