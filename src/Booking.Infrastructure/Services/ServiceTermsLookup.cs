using Booking.Application.Common.Exceptions;
using Booking.Domain.Exceptions;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Booking.Infrastructure.Services;

/// <summary>
/// Kushtet efektive të një shërbimi te një doktor: DoctorService.Custom* e mbivendos
/// vlerën bazë të MedicalService. Burimi i vetëm për kohëzgjatjen dhe çmimin që
/// "ngrin" në termin në momentin e rezervimit (Appointment.Price/Currency).
/// </summary>
internal static class ServiceTermsLookup
{
    internal sealed record ServiceTerms(int DurationMinutes, decimal Price, string Currency);

    public static async Task<ServiceTerms> LoadAsync(
        BookingDbContext dbContext, Guid doctorId, Guid serviceId, CancellationToken cancellationToken)
    {
        var row = await dbContext.DoctorServices
            .Where(ds => ds.DoctorId == doctorId && ds.MedicalServiceId == serviceId && ds.IsActive)
            .Select(ds => new
            {
                ds.CustomDurationMinutes,
                ds.CustomPrice,
                BaseDuration = ds.MedicalService.DurationMinutes,
                BasePrice = ds.MedicalService.Price,
                ds.MedicalService.Currency,
                ServiceActive = ds.MedicalService.IsActive
            })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new BookingRuleException("service-not-offered-by-doctor", "Doktori nuk e ofron këtë shërbim.");

        // Shërbim i çaktivizuar = s'rezervohet më (i njëjti rregull si te available-slots).
        if (!row.ServiceActive)
        {
            throw new NotFoundException("MedicalService", serviceId);
        }

        return new ServiceTerms(
            row.CustomDurationMinutes ?? row.BaseDuration,
            row.CustomPrice ?? row.BasePrice,
            row.Currency);
    }
}
