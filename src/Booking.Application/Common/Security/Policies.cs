namespace Booking.Application.Common.Security;

/// <summary>
/// Authorization policies. Kujdes: rolet japin vetëm shtresën e parë të mbrojtjes —
/// pronësia e resurseve (pacienti i vet, klinika e vet) kontrollohet gjithmonë edhe në services.
/// </summary>
public static class Policies
{
    public const string SuperAdminOnly = "SuperAdminOnly";
    public const string ClinicAdminOnly = "ClinicAdminOnly";
    public const string DoctorOnly = "DoctorOnly";
    public const string PatientOnly = "PatientOnly";
}
