using System.Net.Http.Json;
using Booking.Application.Common.Models;
using Booking.Application.Features.Doctors;
using Booking.Domain.Entities;
using Booking.Infrastructure.Identity;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Qyteti i doktorit nuk ruhet te doktori — del nga degët ku ordinon
/// (DoctorClinicBranch → ClinicBranch.City). Seed-i i ka të gjitha degët në
/// Prishtinë, prandaj çdo test këtu ndërton vetë një degë në një qytet tjetër
/// dhe e pastron pas vetes, që të mos ndikojë testet e tjera në koleksion.
/// </summary>
[Collection("api")]
public class DoctorCityFilterTests
{
    private readonly BookingApiFactory _factory;

    public DoctorCityFilterTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    private const string OtherCity = "Vushtrri";

    /// <summary>
    /// Krijon një degë në <paramref name="city"/> dhe e lidh një doktor të ri me
    /// të. Doktori krijohet posaçërisht që të mos preket asnjë nga doktorët e
    /// seed-it (testet e tjera mbështeten te numri i tyre në Prishtinë).
    /// </summary>
    private async Task<(Guid DoctorId, Guid BranchId, Guid UserId)> SeedDoctorInCityAsync(
        string city, bool branchActive = true, bool linkActive = true)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BookingDbContext>();

        var suffix = Guid.NewGuid().ToString("N")[..8];
        var user = new ApplicationUser
        {
            Id = Guid.NewGuid(),
            FirstName = "Qytetas",
            LastName = $"Test{suffix}",
            Email = $"qytetas-{suffix}@test.dev",
            UserName = $"qytetas-{suffix}@test.dev",
            NormalizedEmail = $"QYTETAS-{suffix}@TEST.DEV",
            NormalizedUserName = $"QYTETAS-{suffix}@TEST.DEV",
            EmailConfirmed = true,
            IsActive = true,
            SecurityStamp = Guid.NewGuid().ToString(),
        };
        var doctor = new Doctor
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            LicenseNumber = $"LIC-{suffix}",
            YearsOfExperience = 5,
            IsVerified = true,
            IsActive = true,
        };
        var branch = new ClinicBranch
        {
            Id = Guid.NewGuid(),
            ClinicId = DbSeeder.Ids.ClinicDardania,
            Name = $"Dega {city} {suffix}",
            Address = "Rr. Testuese 1",
            City = city,
            IsActive = branchActive,
        };

        db.Users.Add(user);
        db.Doctors.Add(doctor);
        db.ClinicBranches.Add(branch);
        db.DoctorClinicBranches.Add(new DoctorClinicBranch
        {
            DoctorId = doctor.Id,
            ClinicBranchId = branch.Id,
            IsActive = linkActive,
        });
        await db.SaveChangesAsync();

        return (doctor.Id, branch.Id, user.Id);
    }

    private async Task CleanupAsync(Guid doctorId, Guid branchId, Guid userId)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BookingDbContext>();
        await db.DoctorClinicBranches
            .Where(dcb => dcb.DoctorId == doctorId)
            .ExecuteDeleteAsync();
        await db.Doctors.Where(d => d.Id == doctorId).ExecuteDeleteAsync();
        await db.ClinicBranches.Where(b => b.Id == branchId).ExecuteDeleteAsync();
        await db.Users.Where(u => u.Id == userId).ExecuteDeleteAsync();
    }

    private static Task<PagedResult<DoctorDto>?> SearchAsync(HttpClient client, string city) =>
        client.GetFromJsonAsync<PagedResult<DoctorDto>>(
            $"/api/doctors?City={Uri.EscapeDataString(city)}", TestHelpers.Json);

    [Fact]
    public async Task SearchDoctors_ByCity_ReturnsOnlyDoctorsWithABranchThere()
    {
        var (doctorId, branchId, userId) = await SeedDoctorInCityAsync(OtherCity);
        try
        {
            var client = _factory.CreateClient();

            var result = await SearchAsync(client, OtherCity);

            result!.Items.Should().ContainSingle(d => d.Id == doctorId);
        }
        finally
        {
            await CleanupAsync(doctorId, branchId, userId);
        }
    }

    [Fact]
    public async Task SearchDoctors_ByAnotherCity_ExcludesTheDoctor()
    {
        var (doctorId, branchId, userId) = await SeedDoctorInCityAsync(OtherCity);
        try
        {
            var client = _factory.CreateClient();

            // Doktori ordinon VETËM në Vushtrri — filtri i Prishtinës s'duhet ta kthejë.
            var result = await SearchAsync(client, "Prishtinë");

            result!.Items.Should().NotContain(d => d.Id == doctorId);
            // Kontroll negativ: doktorët e seed-it janë në Prishtinë, pra filtri
            // nuk po kthen thjesht listë bosh për çdo qytet.
            result.TotalItems.Should().BeGreaterThan(0);
        }
        finally
        {
            await CleanupAsync(doctorId, branchId, userId);
        }
    }

    [Fact]
    public async Task SearchDoctors_ByCity_IsCaseInsensitive()
    {
        var (doctorId, branchId, userId) = await SeedDoctorInCityAsync(OtherCity);
        try
        {
            var client = _factory.CreateClient();

            var result = await SearchAsync(client, OtherCity.ToLowerInvariant());

            result!.Items.Should().ContainSingle(d => d.Id == doctorId);
        }
        finally
        {
            await CleanupAsync(doctorId, branchId, userId);
        }
    }

    [Fact]
    public async Task SearchDoctors_ByCity_IgnoresInactiveBranches()
    {
        var (doctorId, branchId, userId) = await SeedDoctorInCityAsync(OtherCity, branchActive: false);
        try
        {
            var client = _factory.CreateClient();

            var result = await SearchAsync(client, OtherCity);

            result!.Items.Should().NotContain(d => d.Id == doctorId);
        }
        finally
        {
            await CleanupAsync(doctorId, branchId, userId);
        }
    }

    [Fact]
    public async Task SearchDoctors_ByCity_IgnoresInactiveDoctorBranchLinks()
    {
        var (doctorId, branchId, userId) = await SeedDoctorInCityAsync(OtherCity, linkActive: false);
        try
        {
            var client = _factory.CreateClient();

            var result = await SearchAsync(client, OtherCity);

            result!.Items.Should().NotContain(d => d.Id == doctorId);
        }
        finally
        {
            await CleanupAsync(doctorId, branchId, userId);
        }
    }

    [Fact]
    public async Task SearchDoctors_WithoutCity_ReturnsDoctorsFromEveryCity()
    {
        var (doctorId, branchId, userId) = await SeedDoctorInCityAsync(OtherCity);
        try
        {
            var client = _factory.CreateClient();

            var result = await client.GetFromJsonAsync<PagedResult<DoctorDto>>(
                "/api/doctors?PageSize=100", TestHelpers.Json);

            result!.Items.Should().Contain(d => d.Id == doctorId);
        }
        finally
        {
            await CleanupAsync(doctorId, branchId, userId);
        }
    }
}
