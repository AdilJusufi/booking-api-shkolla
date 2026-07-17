using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Security;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Booking.Infrastructure.Services;

/// <summary>
/// Tenant isolation për ClinicAdmin: çdo veprim administrativ verifikon që useri i kyçur
/// menaxhon klinikën përkatëse. Rolet vetëm nuk mjaftojnë — kjo është kontrolli i pronësisë.
/// SuperAdmin ka qasje në çdo klinikë.
/// </summary>
public class TenantAccessService
{
    private readonly BookingDbContext _dbContext;
    private readonly ICurrentUserService _currentUser;

    public TenantAccessService(BookingDbContext dbContext, ICurrentUserService currentUser)
    {
        _dbContext = dbContext;
        _currentUser = currentUser;
    }

    public bool IsSuperAdmin => _currentUser.IsInRole(Roles.SuperAdmin);

    public Guid CurrentUserId => _currentUser.UserId
        ?? throw new AuthenticationFailedException();

    public async Task EnsureCanManageClinicAsync(Guid clinicId, CancellationToken cancellationToken = default)
    {
        if (IsSuperAdmin)
        {
            return;
        }

        var isAssigned = await _dbContext.ClinicAdministrators
            .AnyAsync(a => a.UserId == CurrentUserId && a.ClinicId == clinicId, cancellationToken);

        if (!isAssigned)
        {
            throw new ForbiddenAccessException("Nuk keni qasje administrative në këtë klinikë.");
        }
    }

    /// <summary>Admini menaxhon doktorin nëse doktori punon në një degë të një klinike që ai e menaxhon.</summary>
    public async Task EnsureCanManageDoctorAsync(Guid doctorId, CancellationToken cancellationToken = default)
    {
        if (IsSuperAdmin)
        {
            return;
        }

        var canManage = await _dbContext.DoctorClinicBranches
            .AnyAsync(dcb => dcb.DoctorId == doctorId
                             && _dbContext.ClinicAdministrators.Any(a =>
                                 a.UserId == CurrentUserId && a.ClinicId == dcb.ClinicBranch.ClinicId),
                cancellationToken);

        if (!canManage)
        {
            throw new ForbiddenAccessException("Doktori nuk i përket klinikës suaj.");
        }
    }

    public async Task EnsureCanManageAppointmentAsync(Guid appointmentId, CancellationToken cancellationToken = default)
    {
        if (IsSuperAdmin)
        {
            return;
        }

        var canManage = await _dbContext.Appointments
            .AnyAsync(a => a.Id == appointmentId
                           && _dbContext.ClinicAdministrators.Any(admin =>
                               admin.UserId == CurrentUserId && admin.ClinicId == a.ClinicId),
                cancellationToken);

        if (!canManage)
        {
            throw new ForbiddenAccessException("Termini nuk i përket klinikës suaj.");
        }
    }
}
