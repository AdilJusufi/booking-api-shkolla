using System.Net;
using System.Net.Http.Json;
using Booking.Application.Common.Models;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Auth;
using Booking.Application.Features.Clinics;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Rrugët e SuperAdmin-it që kontrolli në dev s'i ekzekutoi: specializimet (krijo/ndrysho/fshi),
/// çaktivizimi/riaktivizimi i klinikës dhe i përdoruesit, caktimi i administratorit.
/// </summary>
[Collection("api")]
public class SuperAdminFlowsTests
{
    private readonly BookingApiFactory _factory;

    public SuperAdminFlowsTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> SuperAdminAsync()
    {
        var client = _factory.CreateClient();
        return client.WithToken((await TestHelpers.LoginAsync(client, DbSeeder.SuperAdminEmail, BookingApiFactory.SuperAdminPassword)).AccessToken);
    }

    [Fact]
    public async Task Specialty_CanBeCreatedEditedAndDeleted()
    {
        var sa = await SuperAdminAsync();
        var name = $"Spec QA {Guid.NewGuid():N}"[..20];

        var created = await sa.PostAsJsonAsync("/api/admin/specialties", new CreateSpecialtyRequest { Name = name, NameEn = "QA", NameSr = "QA" }, TestHelpers.Json);
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var specialty = (await created.Content.ReadFromJsonAsync<SpecialtyDto>(TestHelpers.Json))!;

        (await sa.PutAsJsonAsync($"/api/admin/specialties/{specialty.Id}", new UpdateSpecialtyRequest
        {
            Name = name + " 2",
            Description = "Përshkrim",
            IsActive = true
        }, TestHelpers.Json)).StatusCode.Should().Be(HttpStatusCode.OK);

        var list = await sa.GetFromJsonAsync<List<SpecialtyDto>>("/api/specialties", TestHelpers.Json);
        list!.Should().Contain(s => s.Id == specialty.Id && s.Name == name + " 2");

        (await sa.DeleteAsync($"/api/admin/specialties/{specialty.Id}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await sa.GetFromJsonAsync<List<SpecialtyDto>>("/api/specialties", TestHelpers.Json))!
            .Should().NotContain(s => s.Id == specialty.Id && s.IsActive);
    }

    [Fact]
    public async Task Clinic_CanBeDeactivatedAndReactivated_AndDisappearsFromSearchMeanwhile()
    {
        var sa = await SuperAdminAsync();
        var clinicId = await RegisterAndApproveClinicAsync(sa);

        (await sa.PostAsync($"/api/admin/clinics/{clinicId}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await _factory.CreateClient().GetAsync($"/api/clinics/{clinicId}")).StatusCode.Should().Be(HttpStatusCode.NotFound);

        (await sa.PostAsync($"/api/admin/clinics/{clinicId}/activate", null)).StatusCode.Should().Be(HttpStatusCode.OK);
        (await _factory.CreateClient().GetAsync($"/api/clinics/{clinicId}")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task User_CanBeDeactivated_CannotLogIn_ThenReactivated()
    {
        var sa = await SuperAdminAsync();
        var email = $"user-qa-{Guid.NewGuid():N}@test.dev";
        var auth = await TestHelpers.RegisterPatientAsync(_factory.CreateClient(), email);

        (await sa.PostAsync($"/api/admin/users/{auth.UserId}/deactivate", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(email, BookingApiFactory.DefaultUserPassword), TestHelpers.Json))
            .IsSuccessStatusCode.Should().BeFalse();

        (await sa.PostAsync($"/api/admin/users/{auth.UserId}/activate", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await _factory.CreateClient().PostAsJsonAsync("/api/auth/login", new LoginRequest(email, BookingApiFactory.DefaultUserPassword), TestHelpers.Json))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task AssigningAnAdmin_GivesThatUserAccessToTheClinic()
    {
        var sa = await SuperAdminAsync();
        var clinicId = await RegisterAndApproveClinicAsync(sa);
        var email = $"admin-i-ri-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(_factory.CreateClient(), email);

        (await sa.PostAsJsonAsync($"/api/admin/clinics/{clinicId}/admins", new AssignClinicAdminRequest { Email = email }, TestHelpers.Json))
            .StatusCode.Should().Be(HttpStatusCode.NoContent);

        var admin = _factory.CreateClient();
        admin.WithToken((await TestHelpers.LoginAsync(admin, email, BookingApiFactory.DefaultUserPassword)).AccessToken);
        var mine = await admin.GetFromJsonAsync<List<AdminClinicDto>>("/api/admin/clinics", TestHelpers.Json);
        mine!.Should().ContainSingle(c => c.Id == clinicId);
    }

    private async Task<Guid> RegisterAndApproveClinicAsync(HttpClient sa)
    {
        var anon = _factory.CreateClient();
        var response = await anon.PostAsJsonAsync("/api/auth/register-clinic", new
        {
            firstName = "Pronar",
            lastName = "Testi",
            email = $"pronar-{Guid.NewGuid():N}@test.dev",
            phoneNumber = "+383 44 888 000",
            password = BookingApiFactory.DefaultUserPassword,
            clinicName = $"Klinika QA {Guid.NewGuid():N}"[..24],
            clinicPhoneNumber = "+383 44 888 001",
            branches = new[] { new { name = "Qendra", address = "Rr. 1", city = "Prishtinë" } }
        }, TestHelpers.Json);
        response.StatusCode.Should().Be(HttpStatusCode.Created);

        var pending = await sa.GetFromJsonAsync<List<AdminClinicDto>>("/api/admin/clinics", TestHelpers.Json);
        var clinic = pending!.OrderByDescending(c => c.CreatedAt).First(c => !c.IsApproved);
        (await sa.PostAsync($"/api/admin/clinics/{clinic.Id}/approve", null)).StatusCode.Should().Be(HttpStatusCode.OK);
        return clinic.Id;
    }
}
