namespace Booking.Application.Common.Interfaces;

/// <summary>
/// Regjistrimi i gjurmëve të auditimit. Record() vetëm e shton rreshtin në DbContext —
/// ruhet bashkë me veprimin në të njëjtin SaveChanges (i njëjti transaksion),
/// kështu që s'ka audit pa veprim dhe as veprim pa audit.
/// KUJDES: kurrë mos fut fusha sensitive (PersonalNumber, password, tokena) në oldValues/newValues.
/// </summary>
public interface IAuditService
{
    void Record(string action, string entityName, string? entityId, object? oldValues = null, object? newValues = null);
}
