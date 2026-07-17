using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Models;
using Booking.Application.Features.Doctors;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Booking.Infrastructure.Queries;

public class DoctorQueryService : IDoctorQueryService
{
    private readonly BookingDbContext _dbContext;

    public DoctorQueryService(BookingDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<PagedResult<DoctorDto>> SearchAsync(DoctorSearchRequest request, CancellationToken cancellationToken = default)
    {
        var query =
            from doctor in _dbContext.Doctors
            join user in _dbContext.Users on doctor.UserId equals user.Id
            where doctor.IsActive && doctor.IsVerified && user.IsActive
            select new { Doctor = doctor, User = user };

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            var pattern = $"%{request.SearchTerm}%";
            query = query.Where(x => EF.Functions.ILike(x.User.FirstName + " " + x.User.LastName, pattern));
        }

        if (request.ClinicId is { } clinicId)
        {
            query = query.Where(x => x.Doctor.DoctorClinicBranches.Any(dcb =>
                dcb.IsActive && dcb.ClinicBranch.IsActive && dcb.ClinicBranch.ClinicId == clinicId));
        }

        if (request.BranchId is { } branchId)
        {
            query = query.Where(x => x.Doctor.DoctorClinicBranches.Any(dcb =>
                dcb.IsActive && dcb.ClinicBranchId == branchId));
        }

        if (request.SpecialtyId is { } specialtyId)
        {
            query = query.Where(x => x.Doctor.DoctorSpecialties.Any(ds => ds.SpecialtyId == specialtyId));
        }

        if (request.ServiceId is { } serviceId)
        {
            query = query.Where(x => x.Doctor.DoctorServices.Any(ds =>
                ds.IsActive && ds.MedicalServiceId == serviceId));
        }

        if (request.AvailableOn is { } date)
        {
            var dayOfWeek = date.DayOfWeek;
            query = query.Where(x => x.Doctor.WorkingSchedules.Any(ws =>
                ws.IsActive
                && ws.DayOfWeek == dayOfWeek
                && (ws.ValidFrom == null || ws.ValidFrom <= date)
                && (ws.ValidUntil == null || date <= ws.ValidUntil)));
        }

        var totalItems = await query.CountAsync(cancellationToken);
        var items = await query
            .OrderBy(x => x.User.LastName).ThenBy(x => x.User.FirstName)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(x => new DoctorDto
            {
                Id = x.Doctor.Id,
                FirstName = x.User.FirstName,
                LastName = x.User.LastName,
                YearsOfExperience = x.Doctor.YearsOfExperience,
                Specialties = x.Doctor.DoctorSpecialties.Select(ds => ds.Specialty.Name).ToList()
            })
            .ToListAsync(cancellationToken);

        return new PagedResult<DoctorDto>
        {
            Items = items,
            Page = request.Page,
            PageSize = request.PageSize,
            TotalItems = totalItems
        };
    }

    public async Task<DoctorDetailsDto> GetByIdAsync(Guid doctorId, CancellationToken cancellationToken = default)
    {
        var doctor = await (
                from d in _dbContext.Doctors
                join user in _dbContext.Users on d.UserId equals user.Id
                where d.Id == doctorId && d.IsActive && d.IsVerified && user.IsActive
                select new DoctorDetailsDto
                {
                    Id = d.Id,
                    FirstName = user.FirstName,
                    LastName = user.LastName,
                    Biography = d.Biography,
                    YearsOfExperience = d.YearsOfExperience,
                    Specialties = d.DoctorSpecialties.Select(ds => ds.Specialty.Name).ToList(),
                    Branches = d.DoctorClinicBranches
                        .Where(dcb => dcb.IsActive
                                      && dcb.ClinicBranch.IsActive
                                      && dcb.ClinicBranch.Clinic.IsApproved
                                      && dcb.ClinicBranch.Clinic.IsActive)
                        .Select(dcb => new DoctorBranchDto
                        {
                            BranchId = dcb.ClinicBranchId,
                            BranchName = dcb.ClinicBranch.Name,
                            ClinicId = dcb.ClinicBranch.ClinicId,
                            ClinicName = dcb.ClinicBranch.Clinic.Name,
                            City = dcb.ClinicBranch.City,
                            Address = dcb.ClinicBranch.Address
                        })
                        .ToList(),
                    Services = d.DoctorServices
                        .Where(ds => ds.IsActive && ds.MedicalService.IsActive)
                        .Select(ds => new DoctorServiceDto
                        {
                            MedicalServiceId = ds.MedicalServiceId,
                            Name = ds.MedicalService.Name,
                            SpecialtyId = ds.MedicalService.SpecialtyId,
                            SpecialtyName = ds.MedicalService.Specialty.Name,
                            DurationMinutes = ds.CustomDurationMinutes ?? ds.MedicalService.DurationMinutes,
                            Price = ds.CustomPrice ?? ds.MedicalService.Price,
                            Currency = ds.MedicalService.Currency
                        })
                        .ToList()
                })
            .FirstOrDefaultAsync(cancellationToken);

        return doctor ?? throw new NotFoundException("Doctor", doctorId);
    }

    public async Task<IReadOnlyList<DoctorServiceDto>> GetServicesAsync(Guid doctorId, CancellationToken cancellationToken = default)
    {
        var doctorExists = await _dbContext.Doctors
            .AnyAsync(d => d.Id == doctorId && d.IsActive && d.IsVerified, cancellationToken);
        if (!doctorExists)
        {
            throw new NotFoundException("Doctor", doctorId);
        }

        return await _dbContext.DoctorServices
            .Where(ds => ds.DoctorId == doctorId && ds.IsActive && ds.MedicalService.IsActive)
            .OrderBy(ds => ds.MedicalService.Name)
            .Select(ds => new DoctorServiceDto
            {
                MedicalServiceId = ds.MedicalServiceId,
                Name = ds.MedicalService.Name,
                SpecialtyId = ds.MedicalService.SpecialtyId,
                SpecialtyName = ds.MedicalService.Specialty.Name,
                DurationMinutes = ds.CustomDurationMinutes ?? ds.MedicalService.DurationMinutes,
                Price = ds.CustomPrice ?? ds.MedicalService.Price,
                Currency = ds.MedicalService.Currency
            })
            .ToListAsync(cancellationToken);
    }
}
