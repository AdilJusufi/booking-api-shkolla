using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Features.Clinics;
using Booking.Application.Features.Doctors;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Booking.Infrastructure.Queries;

public class ClinicQueryService : IClinicQueryService
{
    private readonly BookingDbContext _dbContext;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ITimeZoneService _timeZoneService;

    public ClinicQueryService(
        BookingDbContext dbContext,
        IDateTimeProvider dateTimeProvider,
        ITimeZoneService timeZoneService)
    {
        _dbContext = dbContext;
        _dateTimeProvider = dateTimeProvider;
        _timeZoneService = timeZoneService;
    }

    public async Task<PagedResult<ClinicDto>> SearchAsync(ClinicSearchRequest request, CancellationToken cancellationToken = default)
    {
        var query = _dbContext.Clinics.Where(c => c.IsApproved && c.IsActive);

        if (!string.IsNullOrWhiteSpace(request.City))
        {
            query = query.Where(c => c.Branches.Any(b => b.IsActive && EF.Functions.ILike(b.City, request.City)));
        }

        if (!string.IsNullOrWhiteSpace(request.Municipality))
        {
            query = query.Where(c => c.Branches.Any(b =>
                b.IsActive && b.Municipality != null && EF.Functions.ILike(b.Municipality, request.Municipality)));
        }

        if (request.SpecialtyId is { } specialtyId)
        {
            query = query.Where(c => c.Services.Any(s => s.IsActive && s.SpecialtyId == specialtyId));
        }

        if (request.ServiceId is { } serviceId)
        {
            query = query.Where(c => c.Services.Any(s => s.IsActive && s.Id == serviceId));
        }

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            var pattern = $"%{request.SearchTerm}%";
            query = query.Where(c =>
                EF.Functions.ILike(c.Name, pattern)
                || (c.Description != null && EF.Functions.ILike(c.Description, pattern)));
        }

        if (request.IsOpen == true)
        {
            // "E hapur tani" = ekziston orar pune aktiv që mbulon momentin aktual (ora e Prishtinës).
            // Nuk merr parasysh bllokimet individuale — për to shërben endpoint-i available-slots.
            var localNow = _timeZoneService.ToLocal(_dateTimeProvider.UtcNow);
            var day = localNow.DayOfWeek;
            var time = TimeOnly.FromDateTime(localNow);

            query = query.Where(c => c.Branches.Any(b =>
                b.IsActive && _dbContext.DoctorWorkingSchedules.Any(ws =>
                    ws.ClinicBranchId == b.Id
                    && ws.IsActive
                    && ws.DayOfWeek == day
                    && ws.StartTime <= time
                    && time < ws.EndTime)));
        }

        query = request.SortBy == "name_desc"
            ? query.OrderByDescending(c => c.Name)
            : query.OrderBy(c => c.Name);

        var totalItems = await query.CountAsync(cancellationToken);
        var items = await query
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(c => new ClinicDto
            {
                Id = c.Id,
                Name = c.Name,
                Description = c.Description,
                PhoneNumber = c.PhoneNumber,
                Email = c.Email,
                Website = c.Website,
                Cities = c.Branches.Where(b => b.IsActive).Select(b => b.City).Distinct().ToList()
            })
            .ToListAsync(cancellationToken);

        return new PagedResult<ClinicDto>
        {
            Items = items,
            Page = request.Page,
            PageSize = request.PageSize,
            TotalItems = totalItems
        };
    }

    public async Task<ClinicDetailsDto> GetByIdAsync(Guid clinicId, CancellationToken cancellationToken = default)
    {
        var clinic = await _dbContext.Clinics
            .Where(c => c.Id == clinicId && c.IsApproved && c.IsActive)
            .Select(c => new ClinicDetailsDto
            {
                Id = c.Id,
                Name = c.Name,
                Description = c.Description,
                PhoneNumber = c.PhoneNumber,
                Email = c.Email,
                Website = c.Website,
                Branches = c.Branches
                    .Where(b => b.IsActive)
                    .OrderBy(b => b.Name)
                    .Select(b => new ClinicBranchDto
                    {
                        Id = b.Id,
                        ClinicId = b.ClinicId,
                        Name = b.Name,
                        Address = b.Address,
                        City = b.City,
                        Municipality = b.Municipality,
                        Latitude = b.Latitude,
                        Longitude = b.Longitude,
                        PhoneNumber = b.PhoneNumber
                    })
                    .ToList(),
                Services = c.Services
                    .Where(s => s.IsActive)
                    .OrderBy(s => s.Name)
                    .Select(s => new MedicalServiceDto
                    {
                        Id = s.Id,
                        ClinicId = s.ClinicId,
                        SpecialtyId = s.SpecialtyId,
                        SpecialtyName = s.Specialty.Name,
                        Name = s.Name,
                        Description = s.Description,
                        DurationMinutes = s.DurationMinutes,
                        Price = s.Price,
                        Currency = s.Currency
                    })
                    .ToList()
            })
            .FirstOrDefaultAsync(cancellationToken);

        return clinic ?? throw new NotFoundException("Clinic", clinicId);
    }

    public async Task<IReadOnlyList<ClinicBranchDto>> GetBranchesAsync(Guid clinicId, CancellationToken cancellationToken = default)
    {
        await EnsureClinicVisibleAsync(clinicId, cancellationToken);

        return await _dbContext.ClinicBranches
            .Where(b => b.ClinicId == clinicId && b.IsActive)
            .OrderBy(b => b.Name)
            .Select(b => new ClinicBranchDto
            {
                Id = b.Id,
                ClinicId = b.ClinicId,
                Name = b.Name,
                Address = b.Address,
                City = b.City,
                Municipality = b.Municipality,
                Latitude = b.Latitude,
                Longitude = b.Longitude,
                PhoneNumber = b.PhoneNumber
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<DoctorDto>> GetDoctorsAsync(Guid clinicId, CancellationToken cancellationToken = default)
    {
        await EnsureClinicVisibleAsync(clinicId, cancellationToken);

        return await (
                from doctor in _dbContext.Doctors
                join user in _dbContext.Users on doctor.UserId equals user.Id
                where doctor.IsActive
                      && doctor.IsVerified
                      && user.IsActive
                      && doctor.DoctorClinicBranches.Any(dcb =>
                          dcb.IsActive && dcb.ClinicBranch.IsActive && dcb.ClinicBranch.ClinicId == clinicId)
                orderby user.LastName, user.FirstName
                select new DoctorDto
                {
                    Id = doctor.Id,
                    FirstName = user.FirstName,
                    LastName = user.LastName,
                    YearsOfExperience = doctor.YearsOfExperience,
                    Specialties = doctor.DoctorSpecialties.Select(ds => ds.Specialty.Name).ToList()
                })
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<MedicalServiceDto>> GetServicesAsync(Guid clinicId, CancellationToken cancellationToken = default)
    {
        await EnsureClinicVisibleAsync(clinicId, cancellationToken);

        return await _dbContext.MedicalServices
            .Where(s => s.ClinicId == clinicId && s.IsActive)
            .OrderBy(s => s.Name)
            .Select(s => new MedicalServiceDto
            {
                Id = s.Id,
                ClinicId = s.ClinicId,
                SpecialtyId = s.SpecialtyId,
                SpecialtyName = s.Specialty.Name,
                Name = s.Name,
                Description = s.Description,
                DurationMinutes = s.DurationMinutes,
                Price = s.Price,
                Currency = s.Currency
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<SpecialtyDto>> GetSpecialtiesAsync(CancellationToken cancellationToken = default)
    {
        return await _dbContext.Specialties
            .Where(s => s.IsActive)
            .OrderBy(s => s.Name)
            .Select(s => new SpecialtyDto { Id = s.Id, Name = s.Name, Description = s.Description })
            .ToListAsync(cancellationToken);
    }

    private async Task EnsureClinicVisibleAsync(Guid clinicId, CancellationToken cancellationToken)
    {
        var exists = await _dbContext.Clinics
            .AnyAsync(c => c.Id == clinicId && c.IsApproved && c.IsActive, cancellationToken);
        if (!exists)
        {
            throw new NotFoundException("Clinic", clinicId);
        }
    }
}
