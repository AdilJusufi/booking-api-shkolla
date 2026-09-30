using Booking.Application.Features.Seo;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Booking.Infrastructure.Queries;

public class SitemapQueryService : ISitemapQueryService
{
    private readonly BookingDbContext _dbContext;

    public SitemapQueryService(BookingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<IReadOnlyList<SitemapEntry>> GetProfileEntriesAsync(CancellationToken cancellationToken = default)
    {
        var clinics = await _dbContext.Clinics
            .Where(c => c.IsApproved && c.IsActive)
            .Select(c => new { c.Id, Modified = c.UpdatedAt ?? c.CreatedAt })
            .ToListAsync(cancellationToken);

        // Njësoj si DoctorQueryService.GetByIdAsync, plus të paktën një degë aktive: pa të,
        // profili do të ishte faqe e hollë pa asnjë vend ku mund të rezervohet.
        var doctors = await (
                from doctor in _dbContext.Doctors
                join user in _dbContext.Users on doctor.UserId equals user.Id
                where doctor.IsActive && doctor.IsVerified && user.IsActive
                      && doctor.DoctorClinicBranches.Any(dcb =>
                          dcb.IsActive && dcb.ClinicBranch.IsActive
                          && dcb.ClinicBranch.Clinic.IsApproved && dcb.ClinicBranch.Clinic.IsActive)
                select new { doctor.Id, Modified = doctor.UpdatedAt ?? doctor.CreatedAt })
            .ToListAsync(cancellationToken);

        return clinics.Select(c => new SitemapEntry($"/klinika/{c.Id}", c.Modified))
            .Concat(doctors.Select(d => new SitemapEntry($"/mjeku/{d.Id}", d.Modified)))
            .ToList();
    }
}
