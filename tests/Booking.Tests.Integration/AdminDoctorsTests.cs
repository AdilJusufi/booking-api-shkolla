using System.Net;
using System.Net.Http.Json;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Auth;
using Booking.Application.Features.Doctors;
using Booking.Application.Features.Schedules;
using Booking.Domain.Enums;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Menaxhimi i doktorëve nga ClinicAdmin: update, degë, shërbime (me override),
/// çaktivizim/riaktivizim — dhe pronësia mes klinikave (nuk lejohet të prekësh
/// doktorin e një klinike tjetër, as edhe nëse klinika jote s'është aprovuar ende).
/// </summary>
[Collection("api")]
public class AdminDoctorsTests
{
    private readonly BookingApiFactory _factory;

    public AdminDoctorsTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> DardaniaAdminClientAsync()
    {
        var client = _factory.CreateClient();
        var auth = await TestHelpers.LoginAsync(client, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword);
        return client.WithToken(auth.AccessToken);
    }

    private async Task<HttpClient> SuperAdminClientAsync()
    {
        var client = _factory.CreateClient();
        var auth = await TestHelpers.LoginAsync(client, DbSeeder.SuperAdminEmail, BookingApiFactory.SuperAdminPassword);
        return client.WithToken(auth.AccessToken);
    }

    // ---------- Pronësia mes klinikave ----------

    [Fact]
    public async Task GetDoctors_OwnClinic_ReturnsSeededDoctorsIncludingActiveFlag()
    {
        var client = await DardaniaAdminClientAsync();

        var response = await client.GetAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/doctors");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var doctors = await response.Content.ReadFromJsonAsync<List<AdminDoctorDetailDto>>(TestHelpers.Json);
        doctors!.Should().Contain(d => d.Id == DbSeeder.Ids.DoctorArben && d.IsActive);
        doctors.Should().OnlyContain(d => d.Email.EndsWith("@booking.dev") || d.Email.Contains('@'));
    }

    [Fact]
    public async Task GetDoctors_OtherClinic_IsForbidden()
    {
        var client = await DardaniaAdminClientAsync();

        // Admini i Dardanisë s'ka qasje te Sunny — as edhe për ta LISTUAR, jo vetëm ndryshuar.
        var response = await client.GetAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicSunny}/doctors");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task UpdateDoctor_BelongingToOtherClinic_IsForbidden()
    {
        var client = await DardaniaAdminClientAsync();

        var response = await client.PutAsJsonAsync($"/api/admin/doctors/{DbSeeder.Ids.DoctorElira}", new UpdateDoctorRequest
        {
            FirstName = "Elira",
            LastName = "Hoxha",
            PhoneNumber = "+383 44 999 999",
            LicenseNumber = "LIC-HACKED",
            YearsOfExperience = 10,
            SpecialtyIds = [DbSeeder.Ids.SpecialtyPediatrician]
        }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task UpdateDoctorBranches_ForeignBranch_IsForbidden()
    {
        var client = await DardaniaAdminClientAsync();

        // Dega e Sunny-t nuk i përket klinikës së Dr. Arben-it (Dardania) — mass-assignment.
        var response = await client.PutAsJsonAsync($"/api/admin/doctors/{DbSeeder.Ids.DoctorArben}/branches", new UpdateDoctorBranchesRequest
        {
            BranchIds = [DbSeeder.Ids.BranchSunny]
        }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ---------- Aprovimi i klinikës ----------

    [Fact]
    public async Task DoctorEndpoints_UnapprovedClinic_AreForbiddenUntilApproved()
    {
        var registerClient = _factory.CreateClient();
        var registration = await RegisterClinicAsync(registerClient);
        registration.IsApproved.Should().BeFalse();

        var newAdmin = _factory.CreateClient().WithToken(registration.Auth.AccessToken);
        var beforeApproval = await newAdmin.GetAsync($"/api/admin/clinics/{registration.ClinicId}/doctors");
        beforeApproval.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var superAdmin = await SuperAdminClientAsync();
        (await superAdmin.PostAsync($"/api/admin/clinics/{registration.ClinicId}/approve", content: null))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        var afterApproval = await newAdmin.GetAsync($"/api/admin/clinics/{registration.ClinicId}/doctors");
        afterApproval.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ---------- Update: detaje, specializime ----------

    [Fact]
    public async Task UpdateDoctor_ChangesPersistAndComeBackOnNextGet()
    {
        var client = await DardaniaAdminClientAsync();
        var doctorId = await CreateBareDoctorAsync(client, "Përditësim");

        var update = await client.PutAsJsonAsync($"/api/admin/doctors/{doctorId}", new UpdateDoctorRequest
        {
            FirstName = "Ndryshuar",
            LastName = "Mbiemër",
            PhoneNumber = "+383 44 555 555",
            LicenseNumber = $"LIC-{Guid.NewGuid():N}"[..12],
            Biography = "Bio e re.",
            YearsOfExperience = 15,
            SpecialtyIds = [DbSeeder.Ids.SpecialtyPediatrician]
        }, TestHelpers.Json);
        update.StatusCode.Should().Be(HttpStatusCode.OK);

        var getResponse = await client.GetAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/doctors");
        var doctors = await getResponse.Content.ReadFromJsonAsync<List<AdminDoctorDetailDto>>(TestHelpers.Json);
        var doctor = doctors!.Single(d => d.Id == doctorId);

        doctor.FirstName.Should().Be("Ndryshuar");
        doctor.LastName.Should().Be("Mbiemër");
        doctor.PhoneNumber.Should().Be("+383 44 555 555");
        doctor.YearsOfExperience.Should().Be(15);
        doctor.Specialties.Should().ContainSingle(s => s.Id == DbSeeder.Ids.SpecialtyPediatrician);
    }

    // ---------- Shërbimet: persistencë, override, dhe rezervueshmëria ----------

    [Fact]
    public async Task UpdateDoctorServices_PersistsOverridesAndMakesDoctorActuallyBookable()
    {
        var client = await DardaniaAdminClientAsync();
        var doctorId = await CreateBareDoctorAsync(client, "Rezervueshmëri");

        // Pa shërbime — pikërisht defekti i raportuar: doktori s'është i rezervueshëm.
        var initialDetail = (await (await client.GetAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/doctors"))
                .Content.ReadFromJsonAsync<List<AdminDoctorDetailDto>>(TestHelpers.Json))!
            .Single(d => d.Id == doctorId);
        initialDetail.Services.Should().BeEmpty();

        // Cakto shërbim me override çmimi/kohëzgjatjeje.
        var assignResponse = await client.PutAsJsonAsync($"/api/admin/doctors/{doctorId}/services", new UpdateDoctorServicesRequest
        {
            Services = [new DoctorServiceAssignment
            {
                MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
                CustomDurationMinutes = 45,
                CustomPrice = 33.50m
            }]
        }, TestHelpers.Json);
        assignResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var assigned = await assignResponse.Content.ReadFromJsonAsync<AdminDoctorDetailDto>(TestHelpers.Json);
        var assignedService = assigned!.Services.Should().ContainSingle().Subject;
        assignedService.MedicalServiceId.Should().Be(DbSeeder.Ids.ServiceDentalCleaning);
        assignedService.CustomDurationMinutes.Should().Be(45);
        assignedService.CustomPrice.Should().Be(33.50m);
        assignedService.DurationMinutes.Should().Be(45); // efektiv = override
        assignedService.Price.Should().Be(33.50m);

        // Orar pune — pa të, s'ka slote të lira pavarësisht shërbimit.
        var scheduleResponse = await client.PostAsJsonAsync($"/api/admin/doctors/{doctorId}/working-schedules", new CreateWorkingScheduleRequest
        {
            ClinicBranchId = DbSeeder.Ids.BranchDardania,
            DayOfWeek = TestHelpers.NextMonday().DayOfWeek,
            StartTime = new TimeOnly(8, 0),
            EndTime = new TimeOnly(12, 0),
            SlotDurationMinutes = 30
        }, TestHelpers.Json);
        scheduleResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        // Fundi i vërtetë: një pacient e rezervon me të vërtetë, jo vetëm 200 nga admini.
        var patientClient = _factory.CreateClient();
        var patientAuth = await TestHelpers.RegisterPatientAsync(patientClient);
        patientClient.WithToken(patientAuth.AccessToken);

        var bookingResponse = await patientClient.PostAsJsonAsync("/api/appointments", new CreateAppointmentRequest
        {
            DoctorId = doctorId,
            ClinicBranchId = DbSeeder.Ids.BranchDardania,
            MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
            StartDateTime = TestHelpers.NextMonday().ToDateTime(new TimeOnly(9, 0))
        }, TestHelpers.Json);

        bookingResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var booked = await bookingResponse.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json);
        booked!.DoctorId.Should().Be(doctorId);
        booked.Status.Should().Be(AppointmentStatus.Pending);

        // Heqja e shërbimit e kthen sërish të parezervueshëm.
        var clearResponse = await client.PutAsJsonAsync($"/api/admin/doctors/{doctorId}/services",
            new UpdateDoctorServicesRequest { Services = [] }, TestHelpers.Json);
        clearResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        (await clearResponse.Content.ReadFromJsonAsync<AdminDoctorDetailDto>(TestHelpers.Json))!.Services.Should().BeEmpty();
    }

    // ---------- Çaktivizimi ----------

    [Fact]
    public async Task DeactivateDoctor_WithFutureConfirmedAppointment_IsBlockedWithoutExplicitCancel()
    {
        var client = await DardaniaAdminClientAsync();
        var patientEmail = $"pacient-deact-{Guid.NewGuid():N}@test.dev";
        var patientClient = _factory.CreateClient();
        await TestHelpers.RegisterPatientAsync(patientClient, patientEmail);

        // Admin-created appointments come back Confirmed (clinic-booked, no patient confirmation step).
        var createResponse = await client.PostAsJsonAsync("/api/admin/appointments", new AdminCreateAppointmentRequest
        {
            PatientEmail = patientEmail,
            DoctorId = DbSeeder.Ids.DoctorDriton,
            ClinicBranchId = DbSeeder.Ids.BranchUlpiana,
            MedicalServiceId = DbSeeder.Ids.ServiceDentalFilling,
            StartDateTime = TestHelpers.NextMonday().ToDateTime(new TimeOnly(10, 0))
        }, TestHelpers.Json);
        createResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        var blockedResponse = await client.PostAsJsonAsync($"/api/admin/doctors/{DbSeeder.Ids.DoctorDriton}/deactivate",
            new SetDoctorActiveRequest { CancelFutureAppointments = false }, TestHelpers.Json);
        blockedResponse.StatusCode.Should().Be(HttpStatusCode.Conflict);

        // Ende aktiv — çaktivizimi u refuzua, jo u aplikua pjesërisht.
        var stillActive = (await (await client.GetAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/doctors"))
                .Content.ReadFromJsonAsync<List<AdminDoctorDetailDto>>(TestHelpers.Json))!
            .Single(d => d.Id == DbSeeder.Ids.DoctorDriton);
        stillActive.IsActive.Should().BeTrue();

        var overrideResponse = await client.PostAsJsonAsync($"/api/admin/doctors/{DbSeeder.Ids.DoctorDriton}/deactivate",
            new SetDoctorActiveRequest { CancelFutureAppointments = true }, TestHelpers.Json);
        overrideResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        (await overrideResponse.Content.ReadFromJsonAsync<AdminDoctorDetailDto>(TestHelpers.Json))!.IsActive.Should().BeFalse();

        var appointments = await client.GetFromJsonAsync<Booking.Application.Common.Models.PagedResult<AdminAppointmentListItemDto>>(
            $"/api/admin/appointments?clinicId={DbSeeder.Ids.ClinicDardania}&doctorId={DbSeeder.Ids.DoctorDriton}", TestHelpers.Json);
        appointments!.Items.Should().Contain(a => a.Status == AppointmentStatus.CancelledByClinic);

        // Riaktivizo për të mos ndotur seed-in e përbashkët për testet e tjera të këtij collection.
        (await client.PostAsync($"/api/admin/doctors/{DbSeeder.Ids.DoctorDriton}/activate", content: null))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task DeactivateThenActivate_RemovesAndRestoresFromPublicListing()
    {
        var client = await DardaniaAdminClientAsync();
        var doctorId = await CreateBareDoctorAsync(client, "Ciklishmëri");

        var publicClient = _factory.CreateClient();
        (await (await publicClient.GetAsync($"/api/clinics/{DbSeeder.Ids.ClinicDardania}/doctors"))
                .Content.ReadFromJsonAsync<List<DoctorDto>>(TestHelpers.Json))!
            .Should().Contain(d => d.Id == doctorId);

        (await client.PostAsJsonAsync($"/api/admin/doctors/{doctorId}/deactivate",
                new SetDoctorActiveRequest(), TestHelpers.Json))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        (await (await publicClient.GetAsync($"/api/clinics/{DbSeeder.Ids.ClinicDardania}/doctors"))
                .Content.ReadFromJsonAsync<List<DoctorDto>>(TestHelpers.Json))!
            .Should().NotContain(d => d.Id == doctorId);

        // Por admini ende e sheh (joaktiv) — jo i zhdukur, thjesht i fshehur nga publiku.
        (await (await client.GetAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/doctors"))
                .Content.ReadFromJsonAsync<List<AdminDoctorDetailDto>>(TestHelpers.Json))!
            .Should().Contain(d => d.Id == doctorId && !d.IsActive);

        (await client.PostAsync($"/api/admin/doctors/{doctorId}/activate", content: null))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        (await (await publicClient.GetAsync($"/api/clinics/{DbSeeder.Ids.ClinicDardania}/doctors"))
                .Content.ReadFromJsonAsync<List<DoctorDto>>(TestHelpers.Json))!
            .Should().Contain(d => d.Id == doctorId);
    }

    // ---------- Ndihmës ----------

    private static async Task<Guid> CreateBareDoctorAsync(HttpClient dardaniaAdminClient, string label)
    {
        var response = await dardaniaAdminClient.PostAsJsonAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/doctors", new CreateDoctorRequest
        {
            FirstName = "Test",
            LastName = label,
            Email = $"doktor-{Guid.NewGuid():N}@test.dev",
            PhoneNumber = "+383 44 111 000",
            InitialPassword = BookingApiFactory.DefaultUserPassword,
            LicenseNumber = $"LIC-{Guid.NewGuid():N}"[..12],
            YearsOfExperience = 3,
            SpecialtyIds = [DbSeeder.Ids.SpecialtyDentist],
            BranchIds = [DbSeeder.Ids.BranchDardania],
            ServiceIds = []
        }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var doctor = await response.Content.ReadFromJsonAsync<AdminDoctorDetailDto>(TestHelpers.Json);
        return doctor!.Id;
    }

    private static async Task<RegisterClinicResponse> RegisterClinicAsync(HttpClient client)
    {
        var request = new RegisterClinicRequest
        {
            FirstName = "Drilon",
            LastName = "Krasniqi",
            Email = $"klinika-admin-{Guid.NewGuid():N}@test.dev",
            PhoneNumber = "+383 44 111 222",
            Password = BookingApiFactory.DefaultUserPassword,
            ClinicName = $"Poliklinika Testuese {Guid.NewGuid():N}",
            Description = "Klinikë e krijuar nga testi i integrimit.",
            ClinicPhoneNumber = "+383 38 111 222",
            ClinicEmail = "kontakt@poliklinika-testuese.dev",
            Website = "https://poliklinika-testuese.dev",
            Branches = [new RegisterClinicBranchRequest
            {
                Name = "Dega Qendër",
                Address = "Rr. Testuese 1",
                City = "Prishtinë",
                Municipality = null,
                PhoneNumber = null
            }]
        };

        var response = await client.PostAsJsonAsync("/api/auth/register-clinic", request, TestHelpers.Json);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<RegisterClinicResponse>(TestHelpers.Json))!;
    }
}
