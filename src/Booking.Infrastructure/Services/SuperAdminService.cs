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
using Microsoft.Extensions.Logging;

namespace Booking.Infrastructure.Services;

public class SuperAdminService : ISuperAdminService
{
    private readonly BookingDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IAuditService _auditService;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly IClinicNotificationService _clinicNotifications;
    private readonly ILogger<SuperAdminService> _logger;

    public SuperAdminService(
        BookingDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        IAuditService auditService,
        IDateTimeProvider dateTimeProvider,
        IClinicNotificationService clinicNotifications,
        ILogger<SuperAdminService> logger)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _auditService = auditService;
        _dateTimeProvider = dateTimeProvider;
        _clinicNotifications = clinicNotifications;
        _logger = logger;
    }

    public async Task<AdminClinicDto> ApproveClinicAsync(Guid clinicId, CancellationToken cancellationToken = default)
    {
        var clinic = await GetClinicAsync(clinicId, cancellationToken);
        var wasApproved = clinic.IsApproved;

        if (!wasApproved)
        {
            clinic.IsApproved = true;
            _auditService.Record("CLINIC_APPROVED", nameof(Clinic), clinicId.ToString(),
                new { IsApproved = false }, new { IsApproved = true });
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        var administrators = await ClinicAdministratorLookup.LoadForClinicAsync(_dbContext, clinicId, cancellationToken);

        // Vetëm në kalimin e vërtetë paaprovuar → aprovuar: një thirrje e dytë e
        // endpoint-it s'duhet ta rinjoftojë klinikën. Dështimi i email-it nuk e prish
        // aprovimin — ai tashmë është ruajtur.
        if (!wasApproved)
        {
            try
            {
                await _clinicNotifications.ClinicApprovedAsync(new ClinicApprovedNotificationContext
                {
                    ClinicId = clinic.Id,
                    ClinicName = clinic.Name,
                    AdminEmails = administrators.Select(a => a.Email).ToList()
                }, cancellationToken);
            }
            catch (Exception exception)
            {
                _logger.LogError(exception,
                    "Dështoi njoftimi i aprovimit për klinikën {ClinicId} — aprovimi mbetet i vlefshëm.", clinicId);
            }
        }

        return ToAdminDto(
            clinic, administrators, await ClinicBranchCityLookup.LoadForClinicAsync(_dbContext, clinicId, cancellationToken));
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

        return ToAdminDto(
            clinic,
            await ClinicAdministratorLookup.LoadForClinicAsync(_dbContext, clinicId, cancellationToken),
            await ClinicBranchCityLookup.LoadForClinicAsync(_dbContext, clinicId, cancellationToken));
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

        return new SpecialtyDto { Id = specialty.Id, Name = specialty.Name, Description = specialty.Description, IsActive = specialty.IsActive };
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

        return new SpecialtyDto { Id = specialty.Id, Name = specialty.Name, Description = specialty.Description, IsActive = specialty.IsActive };
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
                // LEFT JOIN — veprimet e sistemit s'kanë user, dhe useri mund të jetë fshirë.
                UserEmail = l.UserId == null
                    ? null
                    : _dbContext.Users.Where(u => u.Id == l.UserId).Select(u => u.Email).FirstOrDefault(),
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

    public async Task<PagedResult<AdminUserDto>> GetUsersAsync(
        AdminUsersQuery query, CancellationToken cancellationToken = default)
    {
        var users = _dbContext.Users.AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.Role))
        {
            // Filtrimi bëhet në DB përmes tabelave të Identity — pa ngarkuar çdo user
            // në memorie siç do të bënte UserManager.GetUsersInRoleAsync.
            var roleName = query.Role.Trim();
            users = users.Where(u => _dbContext.UserRoles.Any(ur =>
                ur.UserId == u.Id
                && _dbContext.Roles.Any(r => r.Id == ur.RoleId && r.Name == roleName)));
        }

        if (query.IsActive is { } isActive)
        {
            users = users.Where(u => u.IsActive == isActive);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = $"%{query.Search.Trim()}%";
            users = users.Where(u =>
                EF.Functions.ILike(u.FirstName + " " + u.LastName, pattern)
                || (u.Email != null && EF.Functions.ILike(u.Email, pattern)));
        }

        var totalItems = await users.CountAsync(cancellationToken);

        var page = await users
            .OrderBy(u => u.FirstName).ThenBy(u => u.LastName)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(u => new
            {
                u.Id,
                u.FirstName,
                u.LastName,
                u.Email,
                u.IsActive,
                u.EmailConfirmed,
                u.CreatedAt,
                Roles = _dbContext.UserRoles
                    .Where(ur => ur.UserId == u.Id)
                    .Join(_dbContext.Roles, ur => ur.RoleId, r => r.Id, (_, r) => r.Name!)
                    .ToList()
            })
            .ToListAsync(cancellationToken);

        // Ky endpoint ekspozon tërë bazën e përdoruesve te SuperAdmin — listimi vetë
        // auditohet. Ruajmë filtrat, jo rreshtat: "kush kërkoi çka" mjafton, ndërsa
        // kopjimi i emrave/email-ave do ta shndërronte audit log-un në bazë të dytë
        // të dhënash personale.
        _auditService.Record("USERS_LISTED_BY_SUPERADMIN", nameof(ApplicationUser), null, null,
            new
            {
                Role = query.Role,
                IsActive = query.IsActive,
                Search = query.Search,
                query.Page,
                query.PageSize,
                ResultCount = totalItems
            });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new PagedResult<AdminUserDto>
        {
            Items = page
                .Select(u => new AdminUserDto
                {
                    Id = u.Id,
                    FullName = $"{u.FirstName} {u.LastName}",
                    Email = u.Email ?? string.Empty,
                    Roles = u.Roles,
                    IsActive = u.IsActive,
                    EmailConfirmed = u.EmailConfirmed,
                    CreatedAt = u.CreatedAt
                })
                .ToList(),
            Page = query.Page,
            PageSize = query.PageSize,
            TotalItems = totalItems
        };
    }

    private async Task<Clinic> GetClinicAsync(Guid clinicId, CancellationToken cancellationToken) =>
        await _dbContext.Clinics.FirstOrDefaultAsync(c => c.Id == clinicId, cancellationToken)
        ?? throw new NotFoundException("Clinic", clinicId);

    private static AdminClinicDto ToAdminDto(
        Clinic clinic, IReadOnlyList<ClinicAdministratorDto> administrators, IReadOnlyList<string> cities) => new()
    {
        Id = clinic.Id,
        Name = clinic.Name,
        Description = clinic.Description,
        PhoneNumber = clinic.PhoneNumber,
        Email = clinic.Email,
        Website = clinic.Website,
        LogoUrl = clinic.LogoUrl,
        IsApproved = clinic.IsApproved,
        IsActive = clinic.IsActive,
        CreatedAt = clinic.CreatedAt,
        Administrators = administrators,
        Cities = cities
    };
}
