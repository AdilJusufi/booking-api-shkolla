using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Features.Patients;
using Booking.Domain.Entities;
using Booking.Infrastructure.Identity;
using Booking.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Booking.Infrastructure.Services;

public class PatientService : IPatientService
{
    private readonly BookingDbContext _dbContext;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IDateTimeProvider _dateTimeProvider;

    public PatientService(
        BookingDbContext dbContext,
        UserManager<ApplicationUser> userManager,
        IDateTimeProvider dateTimeProvider)
    {
        _dbContext = dbContext;
        _userManager = userManager;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<PatientProfileDto> GetMeAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var profile = await (
                from p in _dbContext.PatientProfiles
                join u in _dbContext.Users on p.UserId equals u.Id
                where p.UserId == userId
                select new PatientProfileDto
                {
                    UserId = p.UserId,
                    FirstName = u.FirstName,
                    LastName = u.LastName,
                    Email = u.Email!,
                    PhoneNumber = u.PhoneNumber,
                    DateOfBirth = p.DateOfBirth,
                    Gender = p.Gender,
                    PersonalNumber = p.PersonalNumber,
                    Address = p.Address,
                    City = p.City
                })
            .FirstOrDefaultAsync(cancellationToken);

        return profile ?? throw new NotFoundException("Profili i pacientit nuk u gjet.");
    }

    public async Task<PatientProfileDto> UpdateMeAsync(
        Guid userId, UpdatePatientProfileRequest request, CancellationToken cancellationToken = default)
    {
        var profile = await _dbContext.PatientProfiles
            .FirstOrDefaultAsync(p => p.UserId == userId, cancellationToken)
            ?? throw new NotFoundException("Profili i pacientit nuk u gjet.");

        var user = await _userManager.FindByIdAsync(userId.ToString())
            ?? throw new NotFoundException("User", userId);

        user.FirstName = request.FirstName;
        user.LastName = request.LastName;
        user.PhoneNumber = request.PhoneNumber;
        user.UpdatedAt = _dateTimeProvider.UtcNow;
        await _userManager.UpdateAsync(user);

        profile.DateOfBirth = request.DateOfBirth;
        profile.Gender = request.Gender;
        profile.PersonalNumber = request.PersonalNumber;
        profile.Address = request.Address;
        profile.City = request.City;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return await GetMeAsync(userId, cancellationToken);
    }

    public async Task<IReadOnlyList<DependentDto>> GetDependentsAsync(
        Guid userId, CancellationToken cancellationToken = default)
    {
        var patientProfileId = await GetPatientProfileIdAsync(userId, cancellationToken);

        return await _dbContext.Dependents
            .Where(d => d.PatientProfileId == patientProfileId && d.IsActive)
            .OrderBy(d => d.FirstName)
            .Select(d => new DependentDto
            {
                Id = d.Id,
                FirstName = d.FirstName,
                LastName = d.LastName,
                DateOfBirth = d.DateOfBirth,
                Gender = d.Gender,
                Relationship = d.Relationship,
                IsActive = d.IsActive
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<DependentDto> AddDependentAsync(
        Guid userId, CreateDependentRequest request, CancellationToken cancellationToken = default)
    {
        var patientProfileId = await GetPatientProfileIdAsync(userId, cancellationToken);

        var dependent = new Dependent
        {
            PatientProfileId = patientProfileId,
            FirstName = request.FirstName,
            LastName = request.LastName,
            DateOfBirth = request.DateOfBirth,
            Gender = request.Gender,
            Relationship = request.Relationship
        };
        _dbContext.Dependents.Add(dependent);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return ToDto(dependent);
    }

    public async Task<DependentDto> UpdateDependentAsync(
        Guid userId, Guid dependentId, UpdateDependentRequest request, CancellationToken cancellationToken = default)
    {
        var dependent = await GetOwnedDependentAsync(userId, dependentId, cancellationToken);

        dependent.FirstName = request.FirstName;
        dependent.LastName = request.LastName;
        dependent.DateOfBirth = request.DateOfBirth;
        dependent.Gender = request.Gender;
        dependent.Relationship = request.Relationship;
        await _dbContext.SaveChangesAsync(cancellationToken);

        return ToDto(dependent);
    }

    public async Task DeleteDependentAsync(Guid userId, Guid dependentId, CancellationToken cancellationToken = default)
    {
        var dependent = await GetOwnedDependentAsync(userId, dependentId, cancellationToken);

        dependent.IsActive = false;
        await _dbContext.SaveChangesAsync(cancellationToken);
    }

    private async Task<Guid> GetPatientProfileIdAsync(Guid userId, CancellationToken cancellationToken)
    {
        var patientProfileId = await _dbContext.PatientProfiles
            .Where(p => p.UserId == userId)
            .Select(p => (Guid?)p.Id)
            .FirstOrDefaultAsync(cancellationToken);

        return patientProfileId ?? throw new NotFoundException("Profili i pacientit nuk u gjet.");
    }

    private async Task<Dependent> GetOwnedDependentAsync(
        Guid userId, Guid dependentId, CancellationToken cancellationToken)
    {
        return await _dbContext.Dependents
            .FirstOrDefaultAsync(d => d.Id == dependentId && d.PatientProfile.UserId == userId, cancellationToken)
            ?? throw new NotFoundException("Dependent", dependentId);
    }

    private static DependentDto ToDto(Dependent dependent) => new()
    {
        Id = dependent.Id,
        FirstName = dependent.FirstName,
        LastName = dependent.LastName,
        DateOfBirth = dependent.DateOfBirth,
        Gender = dependent.Gender,
        Relationship = dependent.Relationship,
        IsActive = dependent.IsActive
    };
}
