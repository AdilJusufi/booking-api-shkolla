using Booking.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Booking.Infrastructure.Persistence.Configurations;

public class DoctorClinicBranchConfiguration : IEntityTypeConfiguration<DoctorClinicBranch>
{
    public void Configure(EntityTypeBuilder<DoctorClinicBranch> builder)
    {
        builder.HasKey(dcb => new { dcb.DoctorId, dcb.ClinicBranchId });

        builder.HasOne(dcb => dcb.Doctor)
            .WithMany(d => d.DoctorClinicBranches)
            .HasForeignKey(dcb => dcb.DoctorId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(dcb => dcb.ClinicBranch)
            .WithMany(b => b.DoctorClinicBranches)
            .HasForeignKey(dcb => dcb.ClinicBranchId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
