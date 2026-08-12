using Booking.Application.Features.Admin;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Booking.Infrastructure.Services;

/// <summary>
/// Ngarkon administratorët e caktuar për një ose disa klinika. ClinicAdministrator
/// mban vetëm UserId — emri/email-i vijnë nga tabela e Identity, prandaj duhet një join.
/// E ndarë sepse e përdorin si ClinicAdminService ashtu edhe SuperAdminService.
/// </summary>
internal static class ClinicAdministratorLookup
{
    public static async Task<IReadOnlyDictionary<Guid, List<ClinicAdministratorDto>>> LoadAsync(
        BookingDbContext dbContext,
        IReadOnlyCollection<Guid> clinicIds,
        CancellationToken cancellationToken)
    {
        if (clinicIds.Count == 0)
        {
            return new Dictionary<Guid, List<ClinicAdministratorDto>>();
        }

        var rows = await (
                from admin in dbContext.ClinicAdministrators
                where clinicIds.Contains(admin.ClinicId)
                join user in dbContext.Users on admin.UserId equals user.Id
                select new
                {
                    admin.ClinicId,
                    admin.UserId,
                    user.Email,
                    user.FirstName,
                    user.LastName
                })
            .ToListAsync(cancellationToken);

        return rows
            .GroupBy(r => r.ClinicId)
            .ToDictionary(
                g => g.Key,
                g => g
                    .Select(r => new ClinicAdministratorDto
                    {
                        UserId = r.UserId,
                        Email = r.Email ?? string.Empty,
                        FullName = $"{r.FirstName} {r.LastName}"
                    })
                    .OrderBy(a => a.FullName)
                    .ToList());
    }

    public static async Task<IReadOnlyList<ClinicAdministratorDto>> LoadForClinicAsync(
        BookingDbContext dbContext,
        Guid clinicId,
        CancellationToken cancellationToken)
    {
        var byClinic = await LoadAsync(dbContext, [clinicId], cancellationToken);
        return byClinic.TryGetValue(clinicId, out var admins) ? admins : [];
    }
}
