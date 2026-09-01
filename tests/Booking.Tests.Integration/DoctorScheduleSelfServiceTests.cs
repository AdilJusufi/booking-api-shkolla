using System.Net;
using System.Net.Http.Json;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Auth;
using Booking.Application.Features.Doctors;
using Booking.Application.Features.Schedules;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// GET api/doctor/branches — a doctor's own DoctorClinicBranch assignments, independent
/// of whether they have any working schedule yet. Added alongside a real bug: the
/// branch dropdown on the doctor's own "add schedule" form used to be derived from
/// GetSchedulesAsync's result, so a brand-new doctor (branches assigned, zero schedules —
/// exactly the moment this form exists for) always saw "no branches available".
/// </summary>
[Collection("api")]
public class DoctorScheduleSelfServiceTests
{
    private readonly BookingApiFactory _factory;

    public DoctorScheduleSelfServiceTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task GetBranches_NewDoctorWithNoSchedulesYet_StillReturnsAssignedBranches()
    {
        var adminClient = _factory.CreateClient();
        var adminAuth = await TestHelpers.LoginAsync(adminClient, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword);
        adminClient.WithToken(adminAuth.AccessToken);

        var email = $"doktor-vetevetem-{Guid.NewGuid():N}@test.dev";
        var createResponse = await adminClient.PostAsJsonAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/doctors", new CreateDoctorRequest
        {
            FirstName = "Test",
            LastName = "SefBranch",
            Email = email,
            PhoneNumber = "+383 44 222 000",
            InitialPassword = BookingApiFactory.DefaultUserPassword,
            LicenseNumber = $"LIC-{Guid.NewGuid():N}"[..12],
            YearsOfExperience = 2,
            SpecialtyIds = [DbSeeder.Ids.SpecialtyDentist],
            BranchIds = [DbSeeder.Ids.BranchDardania, DbSeeder.Ids.BranchUlpiana],
            ServiceIds = []
        }, TestHelpers.Json);
        createResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        var doctorClient = _factory.CreateClient();
        var doctorAuth = await TestHelpers.LoginAsync(doctorClient, email, BookingApiFactory.DefaultUserPassword);
        doctorClient.WithToken(doctorAuth.AccessToken);

        // The actual bug: zero schedules yet.
        var schedulesResponse = await doctorClient.GetAsync("/api/doctor/working-schedules");
        schedulesResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        (await schedulesResponse.Content.ReadFromJsonAsync<List<WorkingScheduleDto>>(TestHelpers.Json))!.Should().BeEmpty();

        // Branches must still be there — this is the fix under test.
        var branchesResponse = await doctorClient.GetAsync("/api/doctor/branches");
        branchesResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var branches = await branchesResponse.Content.ReadFromJsonAsync<List<DoctorBranchDto>>(TestHelpers.Json);
        branches!.Select(b => b.BranchId).Should().BeEquivalentTo([DbSeeder.Ids.BranchDardania, DbSeeder.Ids.BranchUlpiana]);
    }

    [Fact]
    public async Task GetBranches_RequiresDoctorRole()
    {
        var patientClient = _factory.CreateClient();
        var patientAuth = await TestHelpers.RegisterPatientAsync(patientClient);
        patientClient.WithToken(patientAuth.AccessToken);

        var response = await patientClient.GetAsync("/api/doctor/branches");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }
}
