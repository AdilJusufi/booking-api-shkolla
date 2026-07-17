using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Common.Security;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Clinics;
using Booking.Domain.Entities;
using Booking.Infrastructure.Identity;
using Booking.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Booking.Infrastructure.Services;

public class SuperAdminService : ISuperAdminService
{
    private readonly BookingDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IAuditService _auditService;
    private readonly IDateTimeProvider _dateTimeProvider;

    public SuperAdminService(
        BookingDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        IAuditService auditService,
        IDateTimeProvider dateTimeProvider)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _auditService = auditService;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<AdminClinicDto> ApproveClinicAsync(Guid clinicId, CancellationToken cancellationToken = default)
    {
        var clinic = await GetClinicAsync(clinicId, cancellationToken);

        if (!clinic.IsApproved)
        {
            clinic.IsApproved = true;
            _auditService.Record("CLINIC_APPROVED", nameof(Clinic), clinicId.ToString(),
                new { IsApproved = false }, new { IsApproved = true });
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return ToAdminDto(clinic);
    }

    public async Task<AdminClinicDto> SetClinicActiveAsync(
        Guid clinicId, bool isActive, CancellationToken cancellationToken = default)
    {
        var clinic = await GetClinicAsync(clinicId, cancellationToken);

        if (clinic.IsActive != isActive)
        {
            _auditService.Record("CLINIC_ACTIVE_CHANGED", nameof(Clinic), clinicId.ToString(),
                new { clinic.IsActive }, new { IsActive = isActive });
            clinic.IsActive = isActive;
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return ToAdminDto(clinic);
    }

    public async Task AssignClinicAdminAsync(
        Guid clinicId, AssignClinicAdminRequest request, CancellationToken cancellationToken = default)
    {
        _ = await GetClinicAsync(clinicId, cancellationToken);

        var user = await _userManager.FindByEmailAsync(request.Email)
            ?? throw new NotFoundException("User", request.Email);

        if (!await _userManager.IsInRoleAsync(user, Roles.ClinicAdmin))
        {
            await _userManager.AddToRoleAsync(user, Roles.ClinicAdmin);
        }

        var alreadyAssigned = await _dbContext.ClinicAdministrators
            .AnyAsync(a => a.UserId == user.Id && a.ClinicId == clinicId, cancellationToken);
        if (alreadyAssigned)
        {
            throw new ConflictException("admin-already-assigned", "Ky user është tashmë administrator i kësaj klinike.");
        }

        _dbContext.ClinicAdministrators.Add(new ClinicAdministrator { UserId = user.Id, ClinicId = clinicId });
        _auditService.Record("CLINIC_ADMIN_ASSIGNED", nameof(ClinicAdministrator), null, null,
            new { ClinicId = clinicId, UserId = user.Id, request.Email });
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<SpecialtyDto> CreateSpecialtyAsync(
        CreateSpecialtyRequest request, CancellationToken cancellationToken = default)
    {
        var nameTaken = await _dbContext.Specialties
            .AnyAsync(s => EF.Functions.ILike(s.Name, request.Name), cancellationToken);
        if (nameTaken)
        {
            throw new ConflictException("specialty-exists", "Ekziston tashmë një specializim me këtë emër.");
        }

        var specialty = new Specialty { Name = request.Name, Description = request.Description };
        _dbContext.Specialties.Add(specialty);

        _auditService.Record("SPECIALTY_CREATED", nameof(Specialty), specialty.Id.ToString(), null, new { specialty.Name });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new SpecialtyDto { Id = specialty.Id, Name = specialty.Name, Description = specialty.Description };
    }

    public async Task<SpecialtyDto> UpdateSpecialtyAsync(
        Guid specialtyId, UpdateSpecialtyRequest request, CancellationToken cancellationToken = default)
    {
        var specialty = await _dbContext.Specialties
            .FirstOrDefaultAsync(s => s.Id == specialtyId, cancellationToken)
            ?? throw new NotFoundException("Specialty", specialtyId);

        _auditService.Record("SPECIALTY_UPDATED", nameof(Specialty), specialtyId.ToString(),
            new { specialty.Name, specialty.Description, specialty.IsActive },
            new { request.Name, request.Description, request.IsActive });

        specialty.Name = request.Name;
        specialty.Description = request.Description;
        specialty.IsActive = request.IsActive;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new SpecialtyDto { Id = specialty.Id, Name = specialty.Name, Description = specialty.Description };
    }

    public async Task DeleteSpecialtyAsync(
        Guid specialtyId, CancellationToken cancellationToken = default)
    {
        var specialty = await _dbContext.Specialties
            .FirstOrDefaultAsync(s => s.Id == specialtyId, cancellationToken)
            ?? throw new NotFoundException("Specialty", specialtyId);

        _auditService.Record("SPECIALTY_DELETED", nameof(Specialty), specialtyId.ToString(),
            new { specialty.Name, specialty.Description, specialty.IsActive }, null);

        // Soft delete: ruajmë rreshtin (FK-të drejt DoctorSpecialty/MedicalService mbeten të vlefshme),
        // vetëm e heqim nga listat aktive. GetSpecialtiesAsync tashmë filtron IsActive.
        specialty.IsActive = false;
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task SetUserActiveAsync(Guid userId, bool isActive, CancellationToken cancellationToken = default)
    {
        var user = await _userManager.FindByIdAsync(userId.ToString())
            ?? throw new NotFoundException("User", userId);

        if (user.IsActive == isActive)
        {
            return;
        }

        _auditService.Record("USER_ACTIVE_CHANGED", "User", userId.ToString(),
            new { user.IsActive }, new { IsActive = isActive });

        user.IsActive = isActive;
        user.UpdatedAt = _dateTimeProvider.UtcNow;
        await _userManager.UpdateAsync(user);

        if (!isActive)
        {
            // Llogaria e çaktivizuar humb menjëherë çdo sesion aktiv.
            var utcNow = _dateTimeProvider.UtcNow;
            await _dbContext.RefreshTokens
                .Where(t => t.UserId == userId && t.RevokedAt == null && t.ExpiresAt > utcNow)
                .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedAt, utcNow), cancellationToken);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<PagedResult<AuditLogDto>> GetAuditLogsAsync(
        AuditLogQuery query, CancellationToken cancellationToken = default)
    {
        var logs = _dbContext.AuditLogs.AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.EntityName))
        {
            logs = logs.Where(l => l.EntityName == query.EntityName);
        }

        if (query.UserId is { } userId)
        {
            logs = logs.Where(l => l.UserId == userId);
        }

        if (query.From is { } from)
        {
            var fromUtc = DateTime.SpecifyKind(from.ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);
            logs = logs.Where(l => l.CreatedAt >= fromUtc);
        }

        if (query.To is { } to)
        {
            var toUtc = DateTime.SpecifyKind(to.AddDays(1).ToDateTime(TimeOnly.MinValue), DateTimeKind.Utc);
            logs = logs.Where(l => l.CreatedAt < toUtc);
        }

        var totalItems = await logs.CountAsync(cancellationToken);
        var items = await logs
            .OrderByDescending(l => l.CreatedAt)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(l => new AuditLogDto
            {
                Id = l.Id,
                UserId = l.UserId,
                Action = l.Action,
                EntityName = l.EntityName,
                EntityId = l.EntityId,
                OldValues = l.OldValues,
                NewValues = l.NewValues,
                IpAddress = l.IpAddress,
                CreatedAt = l.CreatedAt
            })
            .ToListAsync(cancellationToken);

        return new PagedResult<AuditLogDto>
        {
            Items = items,
            Page = query.Page,
            PageSize = query.PageSize,
            TotalItems = totalItems
        };
    }

    private async Task<Clinic> GetClinicAsync(Guid clinicId, CancellationToken cancellationToken) =>
        await _dbContext.Clinics.FirstOrDefaultAsync(c => c.Id == clinicId, cancellationToken)
        ?? throw new NotFoundException("Clinic", clinicId);

    private static AdminClinicDto ToAdminDto(Clinic clinic) => new()
    {
        Id = clinic.Id,
        Name = clinic.Name,
        Description = clinic.Description,
        PhoneNumber = clinic.PhoneNumber,
        Email = clinic.Email,
        Website = clinic.Website,
        IsApproved = clinic.IsApproved,
        IsActive = clinic.IsActive,
        CreatedAt = clinic.CreatedAt
    };
}
