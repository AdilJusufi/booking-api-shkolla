namespace Booking.Application.Common.Security;

/// <summary>Rolet e sistemit — konstante që përdoren në [Authorize], policies dhe seed.</summary>
public static class Roles
{
    public const string Patient = "Patient";
    public const string Doctor = "Doctor";
    public const string ClinicAdmin = "ClinicAdmin";
    public const string SuperAdmin = "SuperAdmin";

    public static readonly string[] All = [Patient, Doctor, ClinicAdmin, SuperAdmin];
}
