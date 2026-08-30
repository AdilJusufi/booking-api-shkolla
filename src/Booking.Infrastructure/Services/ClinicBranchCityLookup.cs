using Microsoft.EntityFrameworkCore;
using Booking.Infrastructure.Persistence;

namespace Booking.Infrastructure.Services;

/// <summary>
/// Ngarkon qytetet e degëve për një ose disa klinika. E ndarë sepse e përdorin
/// si ClinicAdminService ashtu edhe SuperAdminService — shih ClinicAdministratorLookup.
/// </summary>
internal static class ClinicBranchCityLookup
{
    public static async Task<IReadOnlyDictionary<Guid, List<string>>> LoadAsync(
        BookingDbContext dbContext,
        IReadOnlyCollection<Guid> clinicIds,
        CancellationToken cancellationToken)
    {
        if (clinicIds.Count == 0)
        {
            return new Dictionary<Guid, List<string>>();
        }

        var rows = await dbContext.ClinicBranches
            .Where(b => clinicIds.Contains(b.ClinicId))
            .Select(b => new { b.ClinicId, b.City })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(r => r.ClinicId)
            .ToDictionary(
                g => g.Key,
                g => g.Select(r => r.City).Distinct().OrderBy(c => c).ToList());
    }

    public static async Task<IReadOnlyList<string>> LoadForClinicAsync(
        BookingDbContext dbContext,
        Guid clinicId,
        CancellationToken cancellationToken)
    {
        var byClinic = await LoadAsync(dbContext, [clinicId], cancellationToken);
        return byClinic.TryGetValue(clinicId, out var cities) ? cities : [];
    }
}
