using System.Net;
using System.Net.Http.Json;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Clinics;
using Booking.Application.Features.Schedules;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Pjesa 3b (WR-05): shërbimet dhe degët ndryshohen dhe çaktivizohen — kurrë s'fshihen.
/// Ndryshimi i çmimit vlen vetëm për rezervimet e reja; çaktivizimi bllokohet nga
/// terminet e ardhshme. Çdo test krijon shërbimin, degën dhe doktorin e vet.
/// </summary>
[Collection("api")]
public class ServiceAndBranchManagementTests
{
    private readonly BookingApiFactory _factory;

    public ServiceAndBranchManagementTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task EditingServicePrice_AppliesOnlyToNewBookings()
    {
        var admin = await AdminAsync();
        var setup = await SetupAsync(admin);
        var patient = await _factory.CreateSignedInClientAsync();

        var first = await BookAsync(patient, setup, new TimeOnly(9, 0));
        first.Price.Should().Be(30m);

        (await admin.PutAsJsonAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/services/{setup.ServiceId}",
            ServiceRequest("Shërbim QA i ri", 45m), TestHelpers.Json)).StatusCode.Should().Be(HttpStatusCode.OK);

        var second = await BookAsync(patient, setup, new TimeOnly(10, 0));
        second.Price.Should().Be(45m);
        second.ServiceName.Should().Be("Shërbim QA i ri");

        var reread = await patient.GetFromJsonAsync<AppointmentDto>($"/api/appointments/my/{first.Id}", TestHelpers.Json);
        reread!.Price.Should().Be(30m, "termini ekzistues e mban çmimin e dakorduar");
    }

    [Fact]
    public async Task DeactivatingService_IsBlockedByFutureAppointments_ThenHidesIt_AndCanBeReactivated()
    {
        var admin = await AdminAsync();
        var setup = await SetupAsync(admin);
        var patient = await _factory.CreateSignedInClientAsync();
        var appointment = await BookAsync(patient, setup, new TimeOnly(11, 0));
        var baseUrl = $"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/services/{setup.ServiceId}";

        var blocked = await admin.PostAsync($"{baseUrl}/deactivate", null);
        blocked.StatusCode.Should().Be(HttpStatusCode.Conflict);
        var body = await blocked.Content.ReadAsStringAsync();
        body.Should().Contain("service-has-future-appointments").And.Contain("\"futureAppointmentCount\":1");

        (await patient.PostAsJsonAsync($"/api/appointments/{appointment.Id}/cancel", new CancelAppointmentRequest(), TestHelpers.Json))
            .StatusCode.Should().Be(HttpStatusCode.OK);

        (await admin.PostAsync($"{baseUrl}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.OK);

        var publicServices = await admin.GetFromJsonAsync<List<MedicalServiceDto>>(
            $"/api/clinics/{DbSeeder.Ids.ClinicDardania}/services", TestHelpers.Json);
        publicServices!.Should().NotContain(s => s.Id == setup.ServiceId);

        var adminServices = await admin.GetFromJsonAsync<List<MedicalServiceDto>>(
            $"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/services", TestHelpers.Json);
        adminServices!.Should().Contain(s => s.Id == setup.ServiceId && !s.IsActive);

        // Termini i kaluar/anuluar e shfaq ende emrin e shërbimit.
        (await patient.GetFromJsonAsync<AppointmentDto>($"/api/appointments/my/{appointment.Id}", TestHelpers.Json))!
            .ServiceName.Should().Be("Shërbim QA");

        (await admin.PostAsync($"{baseUrl}/activate", null)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await admin.GetFromJsonAsync<List<MedicalServiceDto>>($"/api/clinics/{DbSeeder.Ids.ClinicDardania}/services", TestHelpers.Json))!
            .Should().Contain(s => s.Id == setup.ServiceId);
    }

    [Fact]
    public async Task Branch_CanBeEdited_DeactivationIsBlockedByFutureAppointments()
    {
        var admin = await AdminAsync();
        var setup = await SetupAsync(admin);
        var baseUrl = $"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/branches/{setup.BranchId}";

        var edited = await admin.PutAsJsonAsync(baseUrl, new CreateBranchRequest
        {
            Name = "Dega QA e ndryshuar",
            Address = "Rr. e Re 2",
            City = "Prishtinë",
            PhoneNumber = "+383 44 777 000"
        }, TestHelpers.Json);
        edited.StatusCode.Should().Be(HttpStatusCode.OK);
        (await edited.Content.ReadFromJsonAsync<ClinicBranchDto>(TestHelpers.Json))!.Name.Should().Be("Dega QA e ndryshuar");

        var patient = await _factory.CreateSignedInClientAsync();
        var appointment = await BookAsync(patient, setup, new TimeOnly(13, 0));

        var blocked = await admin.PostAsync($"{baseUrl}/deactivate", null);
        blocked.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await blocked.Content.ReadAsStringAsync()).Should().Contain("branch-has-future-appointments");

        await patient.PostAsJsonAsync($"/api/appointments/{appointment.Id}/cancel", new CancelAppointmentRequest(), TestHelpers.Json);
        (await admin.PostAsync($"{baseUrl}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await admin.GetFromJsonAsync<List<ClinicBranchDto>>($"/api/clinics/{DbSeeder.Ids.ClinicDardania}/branches", TestHelpers.Json))!
            .Should().NotContain(b => b.Id == setup.BranchId);
        (await admin.PostAsync($"{baseUrl}/activate", null)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task OtherClinicAdminAndPatients_GetForbidden()
    {
        var admin = await AdminAsync();
        var setup = await SetupAsync(admin);
        var patient = await _factory.CreateSignedInClientAsync();
        var serviceUrl = $"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/services/{setup.ServiceId}";
        var branchUrl = $"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/branches/{setup.BranchId}";

        (await patient.PutAsJsonAsync(serviceUrl, ServiceRequest("x", 1m), TestHelpers.Json)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await patient.PostAsync($"{branchUrl}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var foreign = await ForeignAdminAsync();
        (await foreign.PutAsJsonAsync(serviceUrl, ServiceRequest("x", 1m), TestHelpers.Json)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await foreign.PostAsync($"{serviceUrl}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await foreign.PostAsync($"{branchUrl}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.Forbidden);

        // Shërbimi i një klinike s'mund të ndryshohet përmes URL-së së një klinike tjetër.
        var sunnyAdmin = foreign;
        (await sunnyAdmin.PutAsJsonAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicSunny}/services/{setup.ServiceId}",
            ServiceRequest("x", 1m), TestHelpers.Json)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task ClinicPage_ShowsWhatPatientsActuallyPay_WhenADoctorOverridesThePrice()
    {
        // WR-07: faqja e klinikës tregonte €30/30 min ndërsa i vetmi mjek merr €55/45 min.
        var admin = await AdminAsync();
        var setup = await SetupAsync(admin);
        (await admin.PutAsJsonAsync($"/api/admin/doctors/{setup.DoctorId}/services", new UpdateDoctorServicesRequest
        {
            Services = [new DoctorServiceAssignment { MedicalServiceId = setup.ServiceId, CustomPrice = 55m, CustomDurationMinutes = 45 }]
        }, TestHelpers.Json)).StatusCode.Should().Be(HttpStatusCode.OK);

        var service = (await admin.GetFromJsonAsync<List<MedicalServiceDto>>(
            $"/api/clinics/{DbSeeder.Ids.ClinicDardania}/services", TestHelpers.Json))!.Single(s => s.Id == setup.ServiceId);

        service.Price.Should().Be(30m);
        service.MinPrice.Should().Be(55m);
        service.MaxPrice.Should().Be(55m);
        service.MinDurationMinutes.Should().Be(45);
        service.MaxDurationMinutes.Should().Be(45);
    }

    // ---------- ndihmës ----------

    private sealed record Setup(Guid DoctorId, Guid ServiceId, Guid BranchId, DateOnly Date);

    private static CreateMedicalServiceRequest ServiceRequest(string name, decimal price) => new()
    {
        SpecialtyId = DbSeeder.Ids.SpecialtyDentist,
        Name = name,
        DurationMinutes = 30,
        Price = price,
        Currency = "EUR"
    };

    private async Task<HttpClient> AdminAsync()
    {
        var client = _factory.CreateClient();
        return client.WithToken((await TestHelpers.LoginAsync(client, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword)).AccessToken);
    }

    private async Task<HttpClient> ForeignAdminAsync()
    {
        var email = $"admin-huaj-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(_factory.CreateClient(), email);
        var superAdmin = _factory.CreateClient();
        superAdmin.WithToken((await TestHelpers.LoginAsync(superAdmin, DbSeeder.SuperAdminEmail, BookingApiFactory.SuperAdminPassword)).AccessToken);
        await superAdmin.PostAsJsonAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicSunny}/admins",
            new AssignClinicAdminRequest { Email = email }, TestHelpers.Json);
        var client = _factory.CreateClient();
        return client.WithToken((await TestHelpers.LoginAsync(client, email, BookingApiFactory.DefaultUserPassword)).AccessToken);
    }

    private static async Task<Setup> SetupAsync(HttpClient admin)
    {
        var clinic = DbSeeder.Ids.ClinicDardania;
        var serviceResponse = await admin.PostAsJsonAsync($"/api/admin/clinics/{clinic}/services", ServiceRequest("Shërbim QA", 30m), TestHelpers.Json);
        serviceResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var service = (await serviceResponse.Content.ReadFromJsonAsync<MedicalServiceDto>(TestHelpers.Json))!;

        var branchResponse = await admin.PostAsJsonAsync($"/api/admin/clinics/{clinic}/branches", new CreateBranchRequest
        {
            Name = $"Dega QA {Guid.NewGuid():N}"[..16],
            Address = "Rr. Testi 1",
            City = "Prishtinë"
        }, TestHelpers.Json);
        branchResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var branch = (await branchResponse.Content.ReadFromJsonAsync<ClinicBranchDto>(TestHelpers.Json))!;

        var doctorResponse = await admin.PostAsJsonAsync($"/api/admin/clinics/{clinic}/doctors", new CreateDoctorRequest
        {
            FirstName = "Menaxhim",
            LastName = "Sherbimi",
            Email = $"doktor-sb-{Guid.NewGuid():N}@test.dev",
            PhoneNumber = "+383 44 555 000",
            InitialPassword = BookingApiFactory.DefaultUserPassword,
            LicenseNumber = $"LIC-{Guid.NewGuid():N}"[..12],
            YearsOfExperience = 1,
            SpecialtyIds = [DbSeeder.Ids.SpecialtyDentist],
            BranchIds = [branch.Id],
            ServiceIds = [service.Id]
        }, TestHelpers.Json);
        doctorResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var doctor = (await doctorResponse.Content.ReadFromJsonAsync<AdminDoctorDetailDto>(TestHelpers.Json))!;

        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(4);
        (await admin.PostAsJsonAsync($"/api/admin/doctors/{doctor.Id}/working-schedules", new CreateWorkingScheduleRequest
        {
            ClinicBranchId = branch.Id,
            DayOfWeek = date.DayOfWeek,
            StartTime = new TimeOnly(8, 0),
            EndTime = new TimeOnly(16, 0),
            SlotDurationMinutes = 30
        }, TestHelpers.Json)).StatusCode.Should().Be(HttpStatusCode.Created);

        return new Setup(doctor.Id, service.Id, branch.Id, date);
    }

    private static async Task<AppointmentDto> BookAsync(HttpClient patient, Setup setup, TimeOnly time)
    {
        var response = await patient.PostAsJsonAsync("/api/appointments", new CreateAppointmentRequest
        {
            DoctorId = setup.DoctorId,
            ClinicBranchId = setup.BranchId,
            MedicalServiceId = setup.ServiceId,
            StartDateTime = setup.Date.ToDateTime(time)
        }, TestHelpers.Json);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json))!;
    }
}
